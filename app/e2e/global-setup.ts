/**
 * Playwright の globalSetup。E2E用DB（db-test）をマイグレーション・リセットし、
 * E2E専用シードを投入してから `webServer` の起動に進む。
 *
 * `.env.test` を明示的に読み込み、接続先を検証してから実行する。ガードの
 * 詳細は `src/__tests__/helpers/testDbGuard.ts`（Jestのintegration project用
 * globalSetupと同じ仕組みを共用）を参照。
 */
import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";
import { assertTestDatabaseUrl } from "../src/__tests__/helpers/testDbGuard";

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env.test"), override: true });

  assertTestDatabaseUrl(process.env.DATABASE_URL);

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });

  const { resetDb, testPrisma } = await import("../src/__tests__/helpers/dbTest");
  await resetDb();

  const { seedE2e } = await import("../prisma/seed.e2e");
  await seedE2e();

  await testPrisma.$disconnect();
}
