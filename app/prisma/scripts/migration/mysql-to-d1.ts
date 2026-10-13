/**
 * MySQL → D1 のデータ移行・照合・リセット（docs/cloudflare-d1-migration-plan.md §7、#689）。
 *
 *   npm run migration:d1 -- migrate --dry-run                                  … 移行元の件数とメールの重複だけを確認（書き込まない）
 *   npm run migration:d1 -- migrate --local                                    … ローカルの D1 へ移行（リハーサルの練習。migrate のときだけ、マイグレーションも自動で適用）
 *   npm run migration:d1 -- migrate --remote --d1-name <名前> --d1-id <ID> --yes  … リモートの D1 へ移行
 *   npm run migration:d1 -- verify  <移行先の指定>                              … 移行元と移行先を照合（読み取りのみ）
 *   npm run migration:d1 -- reset   <移行先の指定> --yes                         … 移行先の全テーブルを空にする（リハーサルのやり直し）
 *
 * 移行元: 環境変数 MIGRATION_SOURCE_DATABASE_URL（取得済みのダンプを復元した、ローカルの MySQL。ホストは localhost のみ許可）。
 *   アプリの DATABASE_URL は読まない（開発用 DB を誤って移行元にしないため）。
 * 移行先: wrangler のログイン（`wrangler login`）で接続する。リモートは、D1 の名前と ID の両方を明示する。
 *   本番の D1（mybooklibrary-db）は、--confirm-production mybooklibrary-db も付けない限り拒否する（最終投入の手順は #691）。
 *
 * 出力は、表名・列名・件数・PASS/FAIL だけ。値（メールアドレス・本文など）は出さない。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient as MysqlClient } from "@/generated/prisma";
import { Prisma as D1Prisma, PrismaClient as D1Client } from "@/generated/prisma-d1";
import { assertSourceUrlIsLocal, assertWritableTarget, safeErrorMessage } from "@/lib/migration/etl/guard";
import { MIGRATION_TABLES } from "@/lib/migration/etl/tables";
import { assertNoEmailCollisions, migrate, resetTarget, verifyAll, type MigrationClient } from "@/lib/migration/etl/run";

type Options = {
  command: string;
  local: boolean;
  remote: boolean;
  dryRun: boolean;
  yes: boolean;
  d1Name?: string;
  d1Id?: string;
  confirmProduction?: string;
  persistTo: string;
};

const APP_DIR = path.resolve(__dirname, "../../..");
const WRANGLER_CLI = path.join(APP_DIR, "node_modules/wrangler/bin/wrangler.js");

function parseArgs(argv: string[]): Options {
  const [command, ...rest] = argv;
  const options: Options = { command, local: false, remote: false, dryRun: false, yes: false, persistTo: path.join(APP_DIR, ".wrangler/migration-rehearsal") };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--local") options.local = true;
    else if (arg === "--remote") options.remote = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--d1-name") options.d1Name = rest[++i];
    else if (arg === "--d1-id") options.d1Id = rest[++i];
    else if (arg === "--confirm-production") options.confirmProduction = rest[++i];
    else if (arg === "--persist-to") options.persistTo = path.resolve(rest[++i]);
    else throw new Error(`不明な引数です: ${arg}`);
  }
  if (!["migrate", "verify", "reset"].includes(command)) {
    throw new Error("使い方: mysql-to-d1.ts <migrate|verify|reset> [--dry-run] (--local | --remote --d1-name <名前> --d1-id <ID>) [--yes]");
  }
  return options;
}

function openSource(): { client: MigrationClient; close: () => Promise<void> } {
  const url = process.env.MIGRATION_SOURCE_DATABASE_URL;
  assertSourceUrlIsLocal(url);
  const prisma = new MysqlClient({ datasourceUrl: url });
  return { client: prisma as unknown as MigrationClient, close: () => prisma.$disconnect() };
}

/** ローカルの D1 に、マイグレーションを適用する（リモートは、デプロイのコマンドが適用する）。 */
function prepareLocalDatabase(configPath: string, persistTo: string): void {
  const result = spawnSync(
    process.execPath,
    [WRANGLER_CLI, "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", persistTo],
    { cwd: APP_DIR, stdio: "inherit", windowsHide: true }
  );
  if (result.status !== 0) throw new Error("ローカルの D1 へのマイグレーションの適用に失敗しました。");
}

async function openTarget(options: Options): Promise<{ client: MigrationClient; close: () => Promise<void> }> {
  const target = assertWritableTarget({
    local: options.local,
    remote: options.remote,
    d1Name: options.d1Name,
    d1Id: options.d1Id,
    confirmProduction: options.confirmProduction,
  });
  const dir = mkdtempSync(path.join(os.tmpdir(), "mbl-etl-"));
  const configPath = path.join(dir, "wrangler.jsonc");
  const binding = {
    binding: "DB",
    database_name: target.name,
    database_id: target.id,
    migrations_dir: path.join(APP_DIR, "prisma/d1/migrations"),
    ...(target.remote ? { remote: true } : {}),
  };
  writeFileSync(configPath, JSON.stringify({ name: "mbl-etl", compatibility_date: "2026-10-01", d1_databases: [binding] }), "utf8");

  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: object }>>> | undefined;
  try {
    if (!target.remote) {
      mkdirSync(options.persistTo, { recursive: true });
      // 照合（verify）・リセットは、移行先を変更する操作（マイグレーションの適用）を伴わない。適用は migrate のときだけ
      if (options.command === "migrate") prepareLocalDatabase(configPath, options.persistTo);
    }
    proxy = await getPlatformProxy<{ DB: object }>({
      configPath,
      ...(target.remote ? { experimental: { remoteBindings: true } } : { persist: { path: path.join(options.persistTo, "v3") } }),
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  const prisma = new D1Client({ adapter: new PrismaD1(proxy.env.DB as never) });
  console.log(`移行先: ${target.remote ? `リモートの D1（${target.name}）` : "ローカルの D1（miniflare）"}`);
  return {
    client: prisma as unknown as MigrationClient,
    close: async () => {
      await prisma.$disconnect();
      await proxy!.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function printChecks(checks: Awaited<ReturnType<typeof verifyAll>>): boolean {
  const failed = checks.filter((check) => check.status === "FAIL");
  for (const check of failed) console.log(`NG  ${check.table} / ${check.check}${check.detail ? ` … ${check.detail}` : ""}`);
  console.log(failed.length === 0 ? `\n照合: すべて成功しました（${checks.length} 項目）。` : `\n照合: ${failed.length} 項目が失敗しました（全 ${checks.length} 項目）。`);
  return failed.length === 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "migrate" && options.dryRun) {
    const source = openSource();
    try {
      await assertNoEmailCollisions(source.client);
      console.log("移行元: メールアドレスの重複（小文字化後）はありません。件数:");
      for (const spec of MIGRATION_TABLES) console.log(`  ${spec.table}: ${await source.client[spec.model].count()} 件`);
      console.log("\n--dry-run のため、書き込みは行っていません。");
    } finally {
      await source.close();
    }
    return;
  }

  if ((options.command === "migrate" || options.command === "reset") && !options.yes) {
    throw new Error("書き込みを伴う操作です。移行先を確認のうえ、--yes を付けて再実行してください。");
  }

  const target = await openTarget(options);
  try {
    if (options.command === "reset") {
      await resetTarget(target.client);
      console.log("移行先の全テーブルを空にしました。");
      return;
    }

    const source = openSource();
    try {
      if (options.command === "migrate") {
        const summaries = await migrate(source.client, target.client, { dbNull: D1Prisma.DbNull, onProgress: (message) => console.log(`  ${message}`) });
        console.log(`\n移行しました（${summaries.length} テーブル、${summaries.reduce((sum, s) => sum + s.written, 0)} 件）。続けて照合します。`);
      }
      const ok = printChecks(await verifyAll(source.client, target.client));
      process.exitCode = ok ? 0 : 1;
    } finally {
      await source.close();
    }
  } finally {
    await target.close();
  }
}

main().catch((error) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});

