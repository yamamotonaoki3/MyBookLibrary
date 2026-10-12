/**
 * D1（SQLite）用マイグレーションの作成と検査。docs/cloudflare-d1-migration-plan.md §4-4 を参照。
 *
 *   npm run d1:migration:new -- <名前>   … D1 版スキーマ（prisma/d1/schema.prisma）との差分から、次の番号のマイグレーションを作る
 *   npm run d1:migration:check           … 既存のマイグレーションを順に適用した結果が D1 版スキーマと一致するか検査（CI で実行）
 *
 * マイグレーションは prisma/d1/migrations/NNNN_名前.sql（wrangler d1 migrations の形式）。
 * 手順: ①MySQL 版スキーマを編集 → ②npm run schema:d1 → ③npm run d1:migration:new -- <名前> →
 * ④MySQL 側のマイグレーション（prisma migrate dev）も作る。
 */
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../d1/migrations");
const D1_SCHEMA = path.resolve(__dirname, "../d1/schema.prisma");
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function assertNamingAndSequence(files: string[]): void {
  files.forEach((file, index) => {
    const match = FILE_PATTERN.exec(file);
    if (!match) throw new Error(`マイグレーションの名前が不正です（NNNN_snake_case.sql）: ${file}`);
    if (Number(match[1]) !== index + 1) {
      throw new Error(`マイグレーションの番号が連番ではありません: ${file}（期待: ${String(index + 1).padStart(4, "0")}）`);
    }
  });
}

/** 既存のマイグレーションを順に適用した一時的な SQLite ファイルを作り、そのパスを返す。 */
function buildDatabaseFromMigrations(files: string[], dir: string): string {
  const dbPath = path.join(dir, "from-migrations.db");
  const db = new DatabaseSync(dbPath);
  try {
    for (const file of files) {
      db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
  } finally {
    db.close();
  }
  return dbPath;
}

/** マイグレーション適用後の DB から D1 版スキーマへの差分 SQL を求める。差分がなければ null。 */
function diffToSchema(dbPath: string): string | null {
  const url = `file:${dbPath.replace(/\\/g, "/")}`;
  // シェルを介さず Prisma CLI を Node で直接起動する（パスに空白があっても引数が分割されない）
  const prismaCli = path.resolve(__dirname, "../../node_modules/prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "diff", "--from-url", url, "--to-schema-datamodel", D1_SCHEMA, "--script", "--exit-code"],
    { encoding: "utf8" }
  );
  if (result.status === 0) return null;
  if (result.status === 2) {
    // Prisma が先頭に出す設定の読み込みログなどを除き、SQL 部分だけを返す
    const sql = result.stdout.split("\n").filter((line) => !line.startsWith("◇") && !line.startsWith("warn")).join("\n").trim();
    return sql;
  }
  throw new Error(`prisma migrate diff が失敗しました:\n${result.stdout}\n${result.stderr}`);
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "d1-migration-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const [command, rawName] = process.argv.slice(2);
  const files = listMigrations();
  assertNamingAndSequence(files);

  if (command === "check") {
    const sql = withTempDir((dir) => diffToSchema(buildDatabaseFromMigrations(files, dir)));
    if (sql) {
      console.error(
        "D1 のマイグレーションを適用した結果が prisma/d1/schema.prisma と一致しません。\n" +
          "`npm run d1:migration:new -- <名前>` でマイグレーションを追加してください。不足している差分:\n\n" +
          sql
      );
      process.exitCode = 1;
      return;
    }
    console.log(`D1 のマイグレーション（${files.length} 件）は D1 版スキーマと一致しています。`);
    return;
  }

  if (command === "new") {
    if (!rawName || !/^[a-z0-9_]+$/.test(rawName)) {
      throw new Error("名前は英小文字・数字・アンダースコアで指定してください（例: add_book_notes）。");
    }
    const sql = withTempDir((dir) => diffToSchema(buildDatabaseFromMigrations(files, dir)));
    if (!sql) {
      console.log("差分がありません。マイグレーションは作成しませんでした。");
      return;
    }
    const next = String(files.length + 1).padStart(4, "0");
    const target = path.join(MIGRATIONS_DIR, `${next}_${rawName}.sql`);
    writeFileSync(target, sql + "\n", "utf8");
    console.log(`作成しました: ${path.relative(process.cwd(), target)}`);
    if (/PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(sql)) {
      console.warn(
        "注意: テーブルの再作成を含みます。D1 は `PRAGMA foreign_keys` を変更できないため、" +
          "`PRAGMA foreign_keys=OFF/ON` の行を `PRAGMA defer_foreign_keys = on;` に置き換えて内容を確認してください。"
      );
    }
    return;
  }

  throw new Error("使い方: d1-migration.ts new <名前> | check");
}

main();
