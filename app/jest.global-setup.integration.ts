/**
 * integration project 専用の globalSetup。
 *
 * `prisma migrate deploy` を実行する前に `DATABASE_URL` を検証する。
 * Prisma CLI は既定で `.env.local`（開発用DB）を自動読み込みするため、
 * ここで明示的に `.env.test` を読み直して上書きし、さらに
 * **接続先が実DB統合テスト用のDBであることを確認できない限り処理を中断する**。
 * 万一 `.env.test` の読み込みに失敗し開発用DBの接続文字列が残っていた場合に、
 * 開発用DBへ `migrate deploy` を実行してしまう事故を防ぐためのガード。
 */
import { execSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";
import { assertTestDatabaseUrl } from "./src/__tests__/helpers/testDbGuard";

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });

  assertTestDatabaseUrl(process.env.DATABASE_URL);

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname),
    env: process.env,
    stdio: "inherit",
  });
}
