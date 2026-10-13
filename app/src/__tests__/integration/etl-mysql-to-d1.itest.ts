/**
 * 結合テスト（MySQL 版）。移行コマンド（`npm run migration:d1`）を、実際の MySQL（テスト用 DB・架空データ）から
 * ローカルの D1（miniflare）へ、通しで実行する（#689）。MySQL を読む Prisma クライアントと、D1 への書き込み・照合の
 * 全体を検証する。実データ・本番の D1 には接続しない。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { testPrisma, resetDb, isD1 } from "../helpers/dbTest";
import { seedFictionalData } from "../helpers/etlFixtures";
import { prisma } from "@/lib/prisma";

// MySQL 版でだけ実行する（D1 版では、移行元の MySQL がないため）
const describeMysql = isD1 ? describe.skip : describe;

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

const APP_DIR = path.resolve(__dirname, "../../..");
const TSX_CLI = path.join(APP_DIR, "node_modules/tsx/dist/cli.mjs");
const SCRIPT = path.join(APP_DIR, "prisma/scripts/migration/mysql-to-d1.ts");

function runCli(args: string[], env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [TSX_CLI, SCRIPT, ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...env },
    timeout: 240_000,
  });
}

describeMysql("移行コマンド（MySQL → ローカルの D1・架空データ）", () => {
  let persistDir: string;

  beforeEach(async () => {
    await resetDb();
    await seedFictionalData(testPrisma);
    persistDir = mkdtempSync(path.join(os.tmpdir(), "mbl-etl-itest-"));
  });

  afterEach(() => {
    rmSync(persistDir, { recursive: true, force: true });
  });

  it("dry-run は、書き込まずに、件数とメールの重複だけを確認する", () => {
    const result = runCli(["migrate", "--dry-run"], { MIGRATION_SOURCE_DATABASE_URL: process.env.DATABASE_URL });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("重複");
    expect(result.stdout).toContain("users: 3 件");
    expect(result.stdout).toContain("書き込みは行っていません");
  });

  it("全 21 テーブルを移行し、照合がすべて成功する（再実行はリセットを挟む）", () => {
    const env = { MIGRATION_SOURCE_DATABASE_URL: process.env.DATABASE_URL };
    const target = ["--local", "--persist-to", persistDir, "--yes"];

    const first = runCli(["migrate", ...target], env);
    expect(first.stderr).not.toContain("失敗");
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("照合: すべて成功しました");

    // 移行済みの移行先には、続けて移行できない
    const again = runCli(["migrate", ...target], env);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("書き込み先が空ではありません");

    const reset = runCli(["reset", ...target], env);
    expect(reset.status).toBe(0);
    const second = runCli(["migrate", ...target], env);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("照合: すべて成功しました");

    // 移行元との照合だけを、あとから実行できる
    const verify = runCli(["verify", "--local", "--persist-to", persistDir], env);
    expect(verify.status).toBe(0);
  }, 300_000);

  it("移行元がローカルでない、または書き込みの確認（--yes）がなければ、何もせず拒否する", () => {
    const remoteSource = runCli(["migrate", "--dry-run"], { MIGRATION_SOURCE_DATABASE_URL: "mysql://user:pass@db.example.com:3306/db" });
    expect(remoteSource.status).toBe(1);
    expect(remoteSource.stderr).toContain("ローカル");

    const noYes = runCli(["migrate", "--local", "--persist-to", persistDir], { MIGRATION_SOURCE_DATABASE_URL: process.env.DATABASE_URL });
    expect(noYes.status).toBe(1);
    expect(noYes.stderr).toContain("--yes");
  }, 120_000);
});
