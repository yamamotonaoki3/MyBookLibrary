/**
 * 移行・照合ツールが誤って本番DBへ接続・書き込みしないための安全装置。
 * 既存の `app/prisma/scripts/aivenDbGuard.ts`（ホスト名の厳密一致確認）と同じ考え方に加え、
 * 許可リスト方式と本番ホスト名との一致検知の二重チェックで拒否する。
 *
 * - 許可リストに無いホストへは接続させない（fail closed）。
 * - 許可リストに含まれていても、本番ホスト名と一致する場合は拒否する
 *   （設定ミスで許可リストに本番ホストを混入させてしまった場合の保険）。
 */

export interface MigrationGuardParams {
  databaseUrl: string | undefined;
  /** カンマ区切りの許可ホスト名一覧（例: "mybooklibrary-staging.aivencloud.com"） */
  allowedHostsCsv: string | undefined;
  /** 本番DBのホスト名（比較専用。この値を使って実際に接続することはない） */
  productionHost: string | undefined;
}

/** DNS上等価なホスト名表記（大文字小文字・末尾のドット）を比較のために正規化する。 */
function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function parseAllowedHosts(allowedHostsCsv: string | undefined): string[] {
  if (!allowedHostsCsv) return [];
  return allowedHostsCsv
    .split(",")
    .map((host) => normalizeHostname(host))
    .filter((host) => host.length > 0);
}

export function assertMigrationTargetAllowed(params: MigrationGuardParams): void {
  const { databaseUrl, allowedHostsCsv, productionHost } = params;

  const allowedHosts = parseAllowedHosts(allowedHostsCsv);
  if (allowedHosts.length === 0) {
    throw new Error(
      "MIGRATION_TARGET_ALLOWED_HOSTS が設定されていません。安全のため接続を中止します。"
    );
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません。接続先を確認できないため中止します。");
  }

  const normalizedProductionHost = productionHost ? normalizeHostname(productionHost) : "";
  if (!normalizedProductionHost) {
    throw new Error(
      "PRODUCTION_DB_HOST が設定されていません。本番ホスト名との突き合わせができないため、" +
        "安全のため接続を中止します。MIGRATION_TARGET_ALLOWED_HOSTS に誤って本番ホストを" +
        "含めてしまう設定ミスを検知するために、この値は省略できません。"
    );
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL の形式が不正です。安全のため接続を中止します。");
  }

  // URLのhostnameはWHATWG URL仕様により既に小文字化されるが、末尾のドット表記
  // （例: "example.com."）はDNS上等価でも文字列としては異なるため、明示的に正規化する。
  const normalizedTargetHost = normalizeHostname(url.hostname);

  if (normalizedTargetHost === normalizedProductionHost) {
    throw new Error(
      `接続先ホスト（${url.hostname}）が本番DBホスト名（PRODUCTION_DB_HOST）と一致しています。` +
        "移行・照合ツールから本番DBへ直接書き込むことはできません。"
    );
  }

  if (!allowedHosts.includes(normalizedTargetHost)) {
    throw new Error(
      "移行先として許可されていないホストです。" +
        `実際の接続先: ホスト ${url.hostname}。` +
        `MIGRATION_TARGET_ALLOWED_HOSTS に含まれるホスト名と完全一致する必要があります。`
    );
  }
}
