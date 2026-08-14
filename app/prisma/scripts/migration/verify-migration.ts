/**
 * dump.sqlと移行先DBを照合するCLI（Issue #478）。
 *
 * 使い方:
 *   cd app
 *   npx dotenv -e .env.migration-target -o -- npx tsx prisma/scripts/migration/verify-migration.ts \
 *     --dump ./prisma/scripts/migration/dumps/dump_xxx.sql \
 *     --phase restored|migrated \
 *     [--source-live]   # 本番切替(#475)時のみ。移行元への直接照会を三者比較に加える
 *
 * ロジック本体は src/lib/migration/verify.ts を参照。ここではPrisma経由のDB接続を
 * VerificationDb インターフェースへ薄くアダプトするだけで、判定ロジックは持たない。
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@/generated/prisma";
import { parseDump } from "@/lib/migration/dumpParser";
import { validateDumpTableSet } from "@/lib/migration/expectedTables";
import { runVerification, type VerificationDb, type Phase } from "@/lib/migration/verify";
import { assertMigrationTargetDatabaseUrl } from "./migrationGuard";

interface CliOptions {
  dumpPath: string;
  phase: Phase;
  sourceLive: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let dumpPath: string | undefined;
  let phase: Phase | undefined;
  let sourceLive = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dump") {
      dumpPath = argv[++i];
    } else if (arg === "--phase") {
      const value = argv[++i];
      if (value !== "restored" && value !== "migrated") {
        throw new Error(`--phase は restored か migrated のいずれかを指定してください（指定値: ${value}）。`);
      }
      phase = value;
    } else if (arg === "--source-live") {
      sourceLive = true;
    }
  }

  if (!dumpPath) throw new Error("--dump <dumpファイルのパス> は必須です。");
  if (!existsSync(dumpPath)) throw new Error(`dumpファイルが見つかりません: ${dumpPath}`);
  if (!phase) throw new Error("--phase restored|migrated は必須です。");

  return { dumpPath, phase, sourceLive };
}

function createPrismaVerificationDb(prisma: PrismaClient): VerificationDb {
  return {
    async countRows(table) {
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM \`${table}\``
      );
      return Number(rows[0]?.count ?? 0);
    },
    async getAutoIncrement(table) {
      const rows = await prisma.$queryRawUnsafe<{ AUTO_INCREMENT: bigint | null }[]>(
        "SELECT AUTO_INCREMENT FROM information_schema.tables " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        table
      );
      const value = rows[0]?.AUTO_INCREMENT;
      return value === null || value === undefined ? null : Number(value);
    },
    async getMaxId(table) {
      const rows = await prisma.$queryRawUnsafe<{ maxId: bigint | null }[]>(
        `SELECT MAX(id) AS maxId FROM \`${table}\``
      );
      const value = rows[0]?.maxId;
      return value === null || value === undefined ? null : Number(value);
    },
    async queryRaw(sql) {
      return prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    },
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertMigrationTargetDatabaseUrl();

  const dumpText = readFileSync(options.dumpPath, "utf-8");
  const expectations = parseDump(dumpText);

  const tableSetValidation = validateDumpTableSet(expectations.map((e) => e.tableName));
  if (!tableSetValidation.valid) {
    const parts: string[] = [];
    if (tableSetValidation.missingTables.length > 0) {
      parts.push(`不足しているテーブル: ${tableSetValidation.missingTables.join(", ")}`);
    }
    if (tableSetValidation.unexpectedTables.length > 0) {
      parts.push(`想定外のテーブル: ${tableSetValidation.unexpectedTables.join(", ")}`);
    }
    throw new Error(
      "dumpのテーブル構成が本番（12件のmigration適用済み）の期待値と一致しません。" +
        "空・不完全なdumpに対する照合は行方不明のテーブルを検出できず誤って成功と判定される" +
        "危険があるため処理を中止します。" +
        parts.join(" / ")
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  const productionHost = process.env.PRODUCTION_DB_HOST;

  const prisma = new PrismaClient();
  let sourcePrisma: PrismaClient | undefined;

  try {
    const db = createPrismaVerificationDb(prisma);

    let sourceDb: VerificationDb | undefined;
    if (options.sourceLive) {
      const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL;
      if (!sourceDatabaseUrl) {
        throw new Error(
          "--source-live 指定時は SOURCE_DATABASE_URL（書き込み凍結中の移行元DB接続文字列）が必須です。"
        );
      }

      const sourceHostname = new URL(sourceDatabaseUrl).hostname.toLowerCase().replace(/\.$/, "");
      const normalizedProductionHost = productionHost?.trim().toLowerCase().replace(/\.$/, "");
      if (!normalizedProductionHost || sourceHostname !== normalizedProductionHost) {
        throw new Error(
          "--source-live 指定時、SOURCE_DATABASE_URL のホスト名は PRODUCTION_DB_HOST と" +
            `完全一致する必要があります（実際: ${sourceHostname}, PRODUCTION_DB_HOST: ${normalizedProductionHost ?? "(未設定)"}）。` +
            "誤って移行先や別のDBを移行元として比較してしまう事故を防ぐための確認です。"
        );
      }

      const targetHostname = databaseUrl
        ? new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "")
        : undefined;
      if (targetHostname && sourceHostname === targetHostname) {
        throw new Error(
          "SOURCE_DATABASE_URL と DATABASE_URL（移行先）が同じホストを指しています。" +
            "SOURCE_DATABASE_URL に誤って移行先の接続文字列がコピーされていないか確認してください。"
        );
      }

      sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl } } });
      sourceDb = createPrismaVerificationDb(sourcePrisma);
    }

    const checks = await runVerification({
      expectations,
      db,
      phase: options.phase,
      sourceDb,
    });

    console.log(`\n=== 照合結果（phase=${options.phase}） ===`);
    for (const check of checks) {
      const mark = check.status === "PASS" ? "✅" : "❌";
      console.log(
        `${mark} [${check.table}] ${check.check}: expected=${check.expected}, actual=${check.actual}` +
          (check.detail ? `\n    detail: ${check.detail}` : "")
      );
    }

    const failed = checks.filter((c) => c.status === "FAIL");
    console.log(`\n合計 ${checks.length}件中 ${failed.length}件 FAIL`);

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    if (sourcePrisma) await sourcePrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ 照合処理に失敗しました:", err);
  process.exitCode = 1;
});
