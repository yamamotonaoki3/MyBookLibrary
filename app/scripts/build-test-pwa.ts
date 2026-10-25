import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { stubEnv } from "../e2e/stub-server";
import { assertTestDatabaseUrl } from "../src/__tests__/helpers/testDbGuard";

const testEnv = dotenv.parse(fs.readFileSync(path.resolve(".env.test")));
assertTestDatabaseUrl(testEnv.DATABASE_URL);
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...testEnv,
    ...stubEnv(3999),
    DB_PROVIDER: "mysql",
    DEMO_MODE: "false",
    NODE_ENV: "production",
    AUTH_TRUST_HOST: "true",
    AUTH_URL: "http://localhost:3200",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.resolve("e2e/font-mocks.cjs"),
  },
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
