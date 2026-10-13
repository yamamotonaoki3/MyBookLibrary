/**
 * 稼働中の Cloudflare Worker のバージョン情報を取得する。
 *
 * Workers 上では、`version_metadata` バインディング（`wrangler.jsonc` の `CF_VERSION_METADATA`）が、
 * いま動いているバージョンの ID・タグ・時刻を返す。ID は `wrangler deployments list` に出るバージョン ID と同じで、
 * ロールバックの前後で、狙ったバージョンへ切り替わったかを確認するために使う。タグには、デプロイ時にバージョン名とコミットを付ける。
 * バージョン名（`0.1.0` など）は、ビルド時に埋め込んだ package.json の version（next.config.ts の APP_VERSION）。
 * Workers 以外（ローカルの Node.js、AWS）では、バインディングがないため null を返す。
 */

export type WorkerVersion = {
  /** アプリのバージョン名（package.json の version。例: 0.1.0）。 */
  name: string | null;
  /** Worker のバージョン ID。 */
  id: string;
  tag: string | null;
  timestamp: string | null;
};

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const VERSION_BINDING_NAME = "CF_VERSION_METADATA";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function getWorkerVersion(): WorkerVersion | null {
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[CLOUDFLARE_CONTEXT];
  const binding = context?.env?.[VERSION_BINDING_NAME];
  if (!binding || typeof binding !== "object") return null;
  const { id, tag, timestamp } = binding as Record<string, unknown>;
  const versionId = stringOrNull(id);
  if (!versionId) return null;
  return { name: stringOrNull(process.env.APP_VERSION), id: versionId, tag: stringOrNull(tag), timestamp: stringOrNull(timestamp) };
}
