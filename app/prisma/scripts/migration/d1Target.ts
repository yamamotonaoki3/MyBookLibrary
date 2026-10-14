/**
 * D1（ローカルの miniflare、またはリモート）への接続。データ移行（mysql-to-d1.ts）とデモのデータ作成（demo/seed-demo.ts）で共用する。
 * 移行先の検証（本番・ステージングの拒否など）は、呼び出し側が、このモジュールの前に済ませる（guard.ts）。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient as D1Client } from "@/generated/prisma-d1";
import type { WritableTarget } from "@/lib/migration/etl/guard";

export const APP_DIR = path.resolve(__dirname, "../../..");
const WRANGLER_CLI = path.join(APP_DIR, "node_modules/wrangler/bin/wrangler.js");

/** ローカルの D1 の保存先の既定（移行・デモのデータ作成で共通。続けて実行すると、同じ D1 を使う）。 */
export const DEFAULT_PERSIST_TO = path.join(APP_DIR, ".wrangler/migration-rehearsal");

/** ローカルの D1 に、マイグレーションを適用する（リモートは、デプロイのコマンドが適用する）。 */
function prepareLocalDatabase(configPath: string, persistTo: string): void {
  const result = spawnSync(
    process.execPath,
    [WRANGLER_CLI, "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", persistTo],
    { cwd: APP_DIR, stdio: "inherit", windowsHide: true }
  );
  if (result.status !== 0) throw new Error("ローカルの D1 へのマイグレーションの適用に失敗しました。");
}

export type OpenedD1 = { client: D1Client; close: () => Promise<void> };

/**
 * 検証済みの移行先（D1）に接続する。`applyMigrations` が真なら、ローカルの D1 にマイグレーションを適用してから接続する
 * （リモートでは使われない）。
 */
export async function openD1Target(target: WritableTarget, options: { applyMigrations: boolean; persistTo: string }): Promise<OpenedD1> {
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
      if (options.applyMigrations) prepareLocalDatabase(configPath, options.persistTo);
    }
    proxy = await getPlatformProxy<{ DB: object }>({
      configPath,
      ...(target.remote ? { experimental: { remoteBindings: true } } : { persist: { path: path.join(options.persistTo, "v3") } }),
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  const client = new D1Client({ adapter: new PrismaD1(proxy.env.DB as never) });
  console.log(`接続先: ${target.remote ? `リモートの D1（${target.name}）` : "ローカルの D1（miniflare）"}`);
  return {
    client,
    close: async () => {
      await client.$disconnect();
      await proxy!.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
