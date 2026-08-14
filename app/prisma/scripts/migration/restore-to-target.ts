/**
 * dump.sqlを移行先DBへrestoreし、必要に応じて`prisma migrate deploy`で未適用migrationを
 * 適用するオーケストレータ（Issue #478）。
 *
 * docs/data-migration-spec-481.md の方式（ETL不要、dump restore + migrate deployのみ）
 * に従う。データの中身を変換するロジックは持たない。
 *
 * 使い方:
 *   cd app
 *   npx dotenv -e .env.migration-target -o --no-expand -- npx tsx prisma/scripts/migration/restore-to-target.ts \
 *     --dump ./prisma/scripts/migration/dumps/dump_xxx.sql \
 *     [--dry-run] [--skip-reset] [--stop-before-migrate]
 *
 * 安全装置:
 *   - migrationGuard.ts で接続先ホストが許可リスト（MIGRATION_TARGET_ALLOWED_HOSTS）に
 *     含まれ、かつ本番ホスト名（PRODUCTION_DB_HOST）と一致しないことを確認してから実行する。
 *   - --dry-run 時は、DBへの書き込み系コマンド（DROP/mysql import/migrate deploy）を
 *     一切発行せず、実行予定の内容を表示するだけで終了する。
 */
import "dotenv/config";
import { readFileSync, existsSync, createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { resolve as resolvePath, join as joinPath } from "node:path";
import { PrismaClient } from "@/generated/prisma";
import { parseDump } from "@/lib/migration/dumpParser";
import { validateDumpTableSet } from "@/lib/migration/expectedTables";
import { computeSha256 } from "@/lib/migration/checksum";
import { assertMigrationTargetDatabaseUrl } from "./migrationGuard";
import { resetTargetDatabase, assertDatabaseIsEmpty } from "./dbReset";

interface CliOptions {
  dumpPath: string;
  dryRun: boolean;
  skipReset: boolean;
  stopBeforeMigrate: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let dumpPath: string | undefined;
  let dryRun = false;
  let skipReset = false;
  let stopBeforeMigrate = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dump") {
      dumpPath = argv[++i];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--skip-reset") {
      skipReset = true;
    } else if (arg === "--stop-before-migrate") {
      stopBeforeMigrate = true;
    }
  }

  if (!dumpPath) {
    throw new Error("--dump <dumpファイルのパス> は必須です。");
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`dumpファイルが見つかりません: ${dumpPath}`);
  }

  return { dumpPath, dryRun, skipReset, stopBeforeMigrate };
}

function buildMysqlArgs(databaseUrl: string): { args: string[]; password: string } {
  const url = new URL(databaseUrl);
  const args = [
    "-h",
    url.hostname,
    "-P",
    url.port || "3306",
    "-u",
    decodeURIComponent(url.username),
  ];

  const sslAccept = url.searchParams.get("sslaccept");
  if (sslAccept === "strict") {
    args.push("--ssl-mode=VERIFY_CA");
  } else if (sslAccept === "accept_invalid_certs") {
    args.push("--ssl-mode=REQUIRED");
  }

  const sslCert = url.searchParams.get("sslcert");
  if (sslCert) {
    // DATABASE_URLのsslcertはPrisma（schema.prismaの配置場所=app/prisma/を基準に相対解決）
    // の慣例に合わせて指定される（例: "../certs/aiven-ca.pem" は app/certs/ を指す）。
    // 一方、ここで起動するmysqlクライアントは本スクリプトのプロセスのcwd基準で相対パスを
    // 解決するため、両者の基準が食い違う。本スクリプトは常に app ディレクトリで
    // 実行される前提（README参照）のため、process.cwd()/prisma を基準に絶対パス化する。
    const prismaSchemaDir = joinPath(process.cwd(), "prisma");
    const resolvedSslCert = resolvePath(prismaSchemaDir, sslCert);
    args.push(`--ssl-ca=${resolvedSslCert}`);
  }

  args.push(url.pathname.replace(/^\//, ""));
  return { args, password: decodeURIComponent(url.password) };
}

/**
 * dump-checksum.ts が生成した `<dump>.sha256` の内容と、dumpファイルの実際の
 * SHA-256を突き合わせる。dump-checksum.ts実行後にdumpファイルが変更されていないことを
 * importの直前に確認するための安全装置。
 */
function verifyDumpChecksum(dumpPath: string): void {
  const checksumPath = `${dumpPath}.sha256`;
  if (!existsSync(checksumPath)) {
    throw new Error(
      `チェックサムファイルが見つかりません: ${checksumPath}\n` +
        "先に 'npx tsx prisma/scripts/migration/dump-checksum.ts <dumpファイルのパス>' を実行してください。"
    );
  }

  const checksumFileContent = readFileSync(checksumPath, "utf-8");
  const checksumMatch = /^([a-fA-F0-9]{64})(?:\s|$)/.exec(checksumFileContent.trim());
  if (!checksumMatch) {
    throw new Error(`チェックサムファイルの内容が不正です: ${checksumPath}`);
  }

  const recordedChecksum = checksumMatch[1].toLowerCase();
  const actualChecksum = computeSha256(readFileSync(dumpPath));
  if (actualChecksum !== recordedChecksum) {
    throw new Error(
      "dumpファイルのSHA-256が記録されたチェックサムと一致しません。" +
        `チェックサム生成後にdumpファイルが変更された可能性があります。` +
        `\n記録値: ${recordedChecksum}\n実測値: ${actualChecksum}`
    );
  }

  console.log(`チェックサム検証OK（${checksumPath} と一致）`);
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdinFilePath?: string,
  shell = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [stdinFilePath ? "pipe" : "inherit", "inherit", "inherit"],
      env,
      shell,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} が終了コード ${code} で失敗しました。`));
      }
    });

    if (stdinFilePath) {
      const input = createReadStream(stdinFilePath);
      input.on("error", reject);
      input.pipe(child.stdin!);
    }
  });
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
        "空のdumpや不完全なdumpを誤って復元しないよう処理を中止します。" +
        parts.join(" / ")
    );
  }

  // テーブル構成（CREATE TABLE文）だけが揃っていても、--no-data等でデータが
  // 空のdumpの場合、_prisma_migrationsの行数チェックだけは通り抜けてしまう。
  // 本番の12件のmigrationレコードが実際に含まれていることも明示的に確認する。
  const prismaMigrationsExpectation = expectations.find(
    (e) => e.tableName === "_prisma_migrations"
  );
  if (prismaMigrationsExpectation?.expectedRowCount !== 12) {
    throw new Error(
      "dumpの _prisma_migrations テーブルの行数が12件ではありません" +
        `（実際: ${prismaMigrationsExpectation?.expectedRowCount ?? 0}件）。` +
        "本番の12件のmigration適用履歴を含まないdump（構造のみのdump等）を" +
        "誤って復元しないよう処理を中止します。"
    );
  }

  console.log("=== 実行計画 ===");
  console.log(`dumpファイル: ${options.dumpPath}`);
  console.log(`テーブル数: ${expectations.length}`);
  for (const table of expectations) {
    console.log(
      `  - ${table.tableName}: 期待行数=${table.expectedRowCount}, ` +
        `AUTO_INCREMENT期待値=${table.expectedAutoIncrement ?? "(対象外)"}`
    );
  }
  console.log(options.skipReset ? "初期化: スキップ（--skip-reset指定）" : "初期化: 全テーブルDROP");
  console.log(
    options.stopBeforeMigrate
      ? "復元手順: mysqlクライアントでdumpを実行後、migrate deploy前に停止"
      : "復元手順: mysqlクライアントでdumpを実行 -> prisma migrate deploy"
  );

  if (options.dryRun) {
    console.log("\n[dry-run] 上記の内容を表示するのみで、DBへの書き込みは行いません。");
    return;
  }

  const totalSteps = options.stopBeforeMigrate ? 2 : 3;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。");
  }

  verifyDumpChecksum(options.dumpPath);

  const prisma = new PrismaClient();
  try {
    if (!options.skipReset) {
      console.log(`\n[1/${totalSteps}] 移行先DBを初期化しています（全テーブルDROP）...`);
      const dropped = await resetTargetDatabase(prisma);
      console.log(`  DROPしたテーブル: ${dropped.length}件`);
      await assertDatabaseIsEmpty(prisma);
    } else {
      console.log(`\n[1/${totalSteps}] 初期化をスキップしました（--skip-reset）。`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n[2/${totalSteps}] mysqlクライアントでdumpを復元しています...`);
  // 初回検証後、DB初期化中にdumpが変更されていないことをimport直前にも確認する。
  verifyDumpChecksum(options.dumpPath);
  const mysqlConnection = buildMysqlArgs(databaseUrl);
  await runCommand(
    "mysql",
    mysqlConnection.args,
    {
      ...process.env,
      MYSQL_PWD: mysqlConnection.password,
    },
    options.dumpPath
  );
  console.log("  復元完了。");

  if (options.stopBeforeMigrate) {
    console.log(
      "\n--stop-before-migrate が指定されたため、migrate deploy前に終了します。" +
        " verify-migration.ts --phase restored で照合してください。"
    );
    return;
  }

  console.log("\n[3/3] prisma migrate deploy を実行しています...");
  const migrateCommand =
    process.platform === "win32"
      ? { command: "npx prisma migrate deploy", args: [], shell: true }
      : { command: "npx", args: ["prisma", "migrate", "deploy"], shell: false };
  await runCommand(
    migrateCommand.command,
    migrateCommand.args,
    process.env,
    undefined,
    migrateCommand.shell
  );
  console.log("  migrate deploy 完了。");

  console.log(
    "\n復元・migrate deployが完了しました。続けて verify-migration.ts で照合を実行してください。"
  );
}

main().catch((err) => {
  console.error("❌ 復元処理に失敗しました:", err);
  process.exitCode = 1;
});
