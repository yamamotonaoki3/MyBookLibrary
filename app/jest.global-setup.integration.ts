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

/** テスト用DBであることの目印。docker-compose.yml の db-test サービスと一致させる。 */
const EXPECTED_TEST_DB_NAME = "mybooklibrary_test";
const EXPECTED_TEST_PORT = "3307";

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL が設定されていません。app/.env.test を作成してください（app/.env.test.example を参照）。"
    );
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL の形式が不正です: ${databaseUrl}`);
  }

  const isTestDb =
    url.port === EXPECTED_TEST_PORT && url.pathname === `/${EXPECTED_TEST_DB_NAME}`;
  if (!isTestDb) {
    throw new Error(
      "実DB統合テストの接続先が db-test（ポート " +
        EXPECTED_TEST_PORT +
        "、DB名 " +
        EXPECTED_TEST_DB_NAME +
        "）と一致しません。開発用DBに接続しようとしている可能性があるため中断します。" +
        ` 実際のURL: ${url.protocol}//${url.hostname}:${url.port}${url.pathname}`
    );
  }

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname),
    env: process.env,
    stdio: "inherit",
  });
}
