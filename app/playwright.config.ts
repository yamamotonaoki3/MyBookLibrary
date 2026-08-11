import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { stubEnv } from "./e2e/stub-server";

const STUB_PORT = 3999;
const APP_PORT = 3100; // next dev の既定ポート(3000)と開発サーバーが競合しないよう分離する

// next dev（webServer）に渡す環境変数。.env.local を読ませると開発DB・実APIに
// 接続してしまうため、.env.test の内容を明示的に渡して上書きする。
// next dev 自体の起動前に環境変数として渡せば .env.local より優先されることを
// 実機で確認済み（#435 実装時の検証）。
const testEnvPath = path.resolve(__dirname, ".env.test");
const testEnv = fs.existsSync(testEnvPath) ? dotenv.parse(fs.readFileSync(testEnvPath)) : {};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      // 楽天・NDL・カーリルの最小スタブサーバー（#434 参照）。
      command: "npx tsx e2e/stub-server.ts",
      port: STUB_PORT,
      env: { STUB_SERVER_PORT: String(STUB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      // .env.test のDB接続情報 + スタブサーバーのURLで next dev を起動する。
      command: "npm run dev -- -p " + APP_PORT,
      port: APP_PORT,
      env: { ...testEnv, ...stubEnv(STUB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
