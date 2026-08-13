/** Aiven検証用スクリプトの接続先を検証専用DBだけに制限する。 */
export function assertAivenDatabaseUrl(
  databaseUrl: string | undefined,
  expectedHostname: string | undefined
): void {
  if (!expectedHostname) {
    throw new Error("AIVEN_STAGING_HOST が設定されていません。安全のため接続を中止します。");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。実際の接続先ホスト: （未設定）");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL の形式が不正です。実際の接続先ホスト: （解析不能）");
  }

  if (url.hostname !== expectedHostname) {
    throw new Error(
      "Aiven検証用DBの接続先ではありません。" +
        "ホスト名が AIVEN_STAGING_HOST と完全一致する必要があります。" +
        ` 実際の接続先: ホスト ${url.hostname}、ポート ${url.port || "（既定値）"}、` +
        `パス ${url.pathname || "（未指定）"}`
    );
  }
}
