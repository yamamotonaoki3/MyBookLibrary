/**
 * integration-d1 project 専用の globalSetup。
 * ローカルの D1（miniflare）を空の状態から作り、D1 のマイグレーションを適用する。
 * 保存先は実行ごとに一意の一時ディレクトリ（Windows のパス長の制限を避けるため短いパスにする）。
 * 本番・開発の D1 には触れない。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  D1_TEST_DATABASE_NAME,
  D1_TEST_PERSIST_DIR_ENV,
  D1_TEST_WRANGLER_CONFIG,
  getD1TestConfigDir,
  getD1TestConfigPath,
} from "./src/__tests__/helpers/d1TestConfig";

export default async function globalSetup(): Promise<void> {
  const persistDir = mkdtempSync(path.join(os.tmpdir(), "mbl-d1-itest-"));
  process.env[D1_TEST_PERSIST_DIR_ENV] = persistDir;
  mkdirSync(getD1TestConfigDir(), { recursive: true });

  // getPlatformProxy 用の設定。D1 のバインディングだけの最小構成（リポジトリの wrangler.jsonc は Worker 本体の
  // main・assets・Cron も含み、テストには不要でビルド成果物を要求するため使わない）と、空の .dev.vars（秘密情報は置かない）
  writeFileSync(getD1TestConfigPath(), JSON.stringify(D1_TEST_WRANGLER_CONFIG, null, 2));
  writeFileSync(path.join(getD1TestConfigDir(), ".dev.vars"), "");

  const wranglerCli = path.resolve(__dirname, "node_modules/wrangler/bin/wrangler.js");
  execFileSync(
    process.execPath,
    [
      wranglerCli, "d1", "migrations", "apply", D1_TEST_DATABASE_NAME, "--local", "--persist-to", persistDir,
      "--config", getD1TestConfigPath(),
    ],
    { cwd: path.resolve(__dirname), stdio: "inherit" }
  );
}
