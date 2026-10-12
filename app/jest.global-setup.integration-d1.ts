/**
 * integration-d1 project 専用の globalSetup。
 * ローカルの D1（miniflare）を空の状態から作り、D1 のマイグレーションを適用する。
 * 保存先は実行ごとに一意の一時ディレクトリ（Windows のパス長の制限を避けるため短いパスにする）。
 * 本番・開発の D1 には触れない。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { D1_TEST_PERSIST_DIR_ENV, getD1TestConfigDir, getD1TestConfigPath } from "./src/__tests__/helpers/d1TestConfig";

export default async function globalSetup(): Promise<void> {
  const persistDir = mkdtempSync(path.join(os.tmpdir(), "mbl-d1-itest-"));
  process.env[D1_TEST_PERSIST_DIR_ENV] = persistDir;
  mkdirSync(getD1TestConfigDir(), { recursive: true });

  // getPlatformProxy 用の設定。wrangler.jsonc のコピーと、空の .dev.vars（秘密情報は置かない）
  copyFileSync(path.resolve(__dirname, "wrangler.jsonc"), getD1TestConfigPath());
  writeFileSync(path.join(getD1TestConfigDir(), ".dev.vars"), "");

  const wranglerCli = path.resolve(__dirname, "node_modules/wrangler/bin/wrangler.js");
  execFileSync(
    process.execPath,
    [wranglerCli, "d1", "migrations", "apply", "mybooklibrary-db", "--local", "--persist-to", persistDir],
    { cwd: path.resolve(__dirname), stdio: "inherit" }
  );
}
