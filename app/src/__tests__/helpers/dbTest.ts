/**
 * 実DB統合テスト（`*.itest.ts`）専用のヘルパー。
 *
 * `jest.global-setup.integration.ts` が `.env.test` の読み込みと
 * `prisma migrate deploy` まで済ませた後、各テストファイルはここの
 * `resetDb()` でテーブルを空にしてから使う。
 *
 * **このファイルは integration project 以外から import しない。**
 * 実際に `prisma.$executeRawUnsafe` で DB に書き込むため、モックしたテストで
 * 誤って import すると実DBへの接続を試みてしまう。
 */
import { PrismaClient } from "@/generated/prisma";

const EXPECTED_TEST_DB_NAME = "mybooklibrary_test";
const EXPECTED_TEST_PORT = "3307";

/**
 * `resetDb()` を呼ぶ前に、接続先が実DB統合テスト用のDBであることを
 * もう一度確認する。`jest.global-setup.integration.ts` と同じガードだが、
 * `DATABASE_URL` を書き換えるコードが将来テスト側に混入する可能性に備えて
 * 実行時にも独立して確認する。
 */
function assertTestDatabaseUrl(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。");
  }
  const url = new URL(databaseUrl);
  const isTestDb = url.port === EXPECTED_TEST_PORT && url.pathname === `/${EXPECTED_TEST_DB_NAME}`;
  if (!isTestDb) {
    throw new Error(
      `resetDb() の接続先が db-test と一致しません: ${url.protocol}//${url.hostname}:${url.port}${url.pathname}`
    );
  }
}

assertTestDatabaseUrl();

/** integration テスト全体で共有する PrismaClient。テストファイルの afterAll で切断する。 */
export const testPrisma = new PrismaClient();

/**
 * 全テーブルを TRUNCATE して空にする。
 *
 * テーブル一覧は `information_schema` から動的に取得するため、
 * schema.prisma にモデルが増えても手動でリストを更新する必要がない。
 * `_prisma_migrations` はマイグレーション履歴なので対象から除く。
 */
export async function resetDb(): Promise<void> {
  assertTestDatabaseUrl();

  // MySQL は information_schema.tables のカラムを大文字（TABLE_NAME）で返す。
  const tables = await testPrisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${EXPECTED_TEST_DB_NAME}
      AND table_name != '_prisma_migrations'
  `;

  await testPrisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const { TABLE_NAME: tableName } of tables) {
      await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE \`${tableName}\``);
    }
  } finally {
    await testPrisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  }
}
