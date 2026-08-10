export const EXPECTED_TEST_DB_NAME = "mybooklibrary_test";

const EXPECTED_TEST_PORT = "3307";
const ALLOWED_TEST_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/** 破壊的な実DB統合テスト処理をローカルのテスト用DBだけに制限する。 */
export function assertTestDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL の形式が不正です: ${databaseUrl}`);
  }

  const isTestDb =
    ALLOWED_TEST_HOSTNAMES.has(url.hostname) &&
    url.port === EXPECTED_TEST_PORT &&
    url.pathname === `/${EXPECTED_TEST_DB_NAME}`;

  if (!isTestDb) {
    throw new Error(
      "実DB統合テストの接続先がローカルの db-test " +
        `（ホスト localhost または 127.0.0.1、ポート ${EXPECTED_TEST_PORT}、` +
        `DB名 ${EXPECTED_TEST_DB_NAME}）と一致しません。` +
        ` 実際の接続先: ホスト ${url.hostname}、URL ${url.protocol}//${url.hostname}:${url.port}${url.pathname}`
    );
  }
}
