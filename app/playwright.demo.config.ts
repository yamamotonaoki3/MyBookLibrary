import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * デモ環境の保護（DEMO_MODE=true、#721）の E2E。通常の E2E（playwright.config.ts）とは別に、アプリを DEMO_MODE=true で起動して実行する
 * （npm run test:e2e:demo。通常の E2E とは同時に実行しない。同じポート・同じ E2E 用 DB を使う）。
 */
const webServer = (Array.isArray(base.webServer) ? base.webServer : []).map((server) =>
  // アプリのサーバー（スタブサーバー以外）に DEMO_MODE を渡す。既存のサーバーは再利用しない（DEMO_MODE が付かないため）
  server.command?.includes("npm run dev") ? { ...server, env: { ...server.env, DEMO_MODE: "true" }, reuseExistingServer: false } : server
);

export default defineConfig({
  ...base,
  testDir: "./e2e-demo",
  webServer,
});
