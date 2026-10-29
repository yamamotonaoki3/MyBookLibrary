/**
 * Cloudflare の Cron Trigger（`scheduled` イベント）から、新刊チェック・書誌補完 API を内部呼び出しする。
 *
 * OpenNext が作る Worker は `fetch` しか持たないため、カスタムの Worker エントリ（worker/index.mjs）で
 * `scheduled` を足す。AWS の EventBridge + Lambda と同じく、`GET /api/cron/check-new-books` を Bearer 認証で
 * 呼び出す。HTTP を介さず Worker 内の `fetch` ハンドラを直接呼ぶ。
 * docs/features/cron.md、docs/archive/cloudflare-d1-migration-plan.md §4-7 を参照。
 */

export const ENRICHMENT_TICK_CRON = "30 * * * *";
export const ENRICHMENT_TICK_PATH = "/api/admin/book-enrichment/tick";
export const CHECK_NEW_BOOKS_PATH = "/api/cron/check-new-books";
/** デモ環境（DEMO_MODE=true）の定期的な初期化（#721）。デモ環境では、新刊チェックの代わりに、これを呼ぶ。 */
export const RESET_DEMO_PATH = "/api/cron/reset-demo";

/** Workers の環境（バインディング・変数・secret）のうち、Cron が使うもの。 */
export type CronEnv = {
  /** Bearer 認証の値（Worker の secret。値はログに出さない）。 */
  CRON_SECRET?: string;
  ENRICHMENT_TICK_SECRET?: string;
  /** 内部リクエストの URL の origin。未設定なら http://localhost。 */
  CRON_TARGET_ORIGIN?: string;
  /** "true" のときは、デモ環境。新刊チェックの代わりに、デモの初期化 API を呼ぶ。 */
  DEMO_MODE?: string;
};

type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };
type AppFetch<Env extends CronEnv> = (request: Request, env: Env, ctx: ExecutionContextLike) => Promise<Response>;
type ScheduledController = { cron: string; scheduledTime?: number };

const DEFAULT_ORIGIN = "http://localhost";

/**
 * `scheduled` ハンドラを作る。
 * - 呼び先用のsecretが未設定なら、APIを呼ばず失敗させる（デモの書誌補完tickはスキップ）。
 * - API が 2xx 以外を返した場合も失敗にする。Cloudflare の Cron は自動で再試行しないため、
 *   失敗は次の定時実行（API は重複通知を作らない冪等な作りなので、再実行しても安全）まで持ち越される。
 */
export function createScheduledHandler<Env extends CronEnv>(appFetch: AppFetch<Env>) {
  return async (controller: ScheduledController, env: Env, ctx: ExecutionContextLike): Promise<void> => {
    const isEnrichmentTick = controller.cron === ENRICHMENT_TICK_CRON;
    if (isEnrichmentTick && env.DEMO_MODE === "true") {
      console.log(JSON.stringify({ level: "info", msg: "enrichment tick skipped in demo", cron: controller.cron }));
      return;
    }
    const secretName = isEnrichmentTick ? "ENRICHMENT_TICK_SECRET" : "CRON_SECRET";
    const secret = env[secretName];
    if (!secret) {
      console.error(JSON.stringify({ level: "error", msg: `${secretName} is not configured`, cron: controller.cron }));
      throw new Error(`${secretName} is not configured`);
    }
    const path = isEnrichmentTick ? ENRICHMENT_TICK_PATH
      : env.DEMO_MODE === "true" ? RESET_DEMO_PATH : CHECK_NEW_BOOKS_PATH;
    const request = new Request(new URL(path, env.CRON_TARGET_ORIGIN ?? DEFAULT_ORIGIN), {
      headers: { authorization: `Bearer ${secret}` },
    });

    ctx.waitUntil(
      (async () => {
        const response = await appFetch(request, env, ctx);
        const body = await response.text();
        console.log(JSON.stringify({ level: "info", msg: "cron finished", cron: controller.cron, status: response.status, body }));
        if (!response.ok) throw new Error(`cron failed: ${response.status}`);
      })()
    );
  };
}
