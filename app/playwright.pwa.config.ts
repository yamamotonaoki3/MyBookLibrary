import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { stubEnv } from "./e2e/stub-server";
import { assertTestDatabaseUrl } from "./src/__tests__/helpers/testDbGuard";

const testEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, ".env.test")));
assertTestDatabaseUrl(testEnv.DATABASE_URL);

// Dedicated local stub; reject accidental external destinations before starting servers.
const protectionStub = new URL(process.env.PROTECTION_STUB_ORIGIN ?? "http://localhost:3999");
if (protectionStub.protocol !== "http:" || protectionStub.hostname !== "localhost" ||
    protectionStub.username || protectionStub.password || protectionStub.pathname !== "/" ||
    protectionStub.search || protectionStub.hash || !protectionStub.port) {
  throw new Error("PROTECTION_STUB_ORIGIN must be an HTTP localhost origin with an explicit port");
}
const stubPort = Number(protectionStub.port);

// Run after build:test:pwa, sequentially with the other MySQL E2E projects.
export default defineConfig({
  testDir: "./e2e-pwa",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { outputFolder: "playwright-report-pwa", open: "never" }]],
  use: { baseURL: "http://localhost:3200", serviceWorkers: "allow", trace: "retain-on-failure" },
  projects: [{ name: "chromium-pwa", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx e2e/stub-server.ts",
      port: stubPort,
      env: { STUB_SERVER_PORT: String(stubPort), PROTECTION_STUB_ORIGIN: protectionStub.origin },
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- -p 3200",
      port: 3200,
      env: { ...testEnv, ...stubEnv(stubPort), CALIL_API_KEY: "e2e-stub-only", DB_PROVIDER: "mysql", DEMO_MODE: "false", NODE_ENV: "production", AUTH_TRUST_HOST: "true", AUTH_URL: "http://localhost:3200" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
