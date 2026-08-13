const AIVEN_HOSTNAME_SUFFIX = ".aivencloud.com";

/** Aiven検証用スクリプトの接続先をAiven上のDBだけに制限する。 */
export function assertAivenDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。実際の接続先ホスト: （未設定）");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL の形式が不正です。実際の接続先ホスト: （解析不能）");
  }

  if (!url.hostname.endsWith(AIVEN_HOSTNAME_SUFFIX)) {
    throw new Error(
      "Aiven検証用DBの接続先ではありません。" +
        `ホスト名が ${AIVEN_HOSTNAME_SUFFIX} で終わる必要があります。` +
        ` 実際の接続先: ホスト ${url.hostname}、ポート ${url.port || "（既定値）"}、` +
        `パス ${url.pathname || "（未指定）"}`
    );
  }
}
