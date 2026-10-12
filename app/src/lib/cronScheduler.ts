/**
 * Cloudflare の Cron Trigger（`scheduled` イベント）から、新刊チェック API を内部呼び出しする。
 *
 * OpenNext が作る Worker は `fetch` しか持たないため、カスタムの Worker エントリ（worker/index.mjs）で
 * `scheduled` を足す。AWS の EventBridge + Lambda と同じく、`GET /api/cron/check-new-books` を Bearer 認証で
 * 呼び出す。HTTP を介さず Worker 内の `fetch` ハンドラを直接呼ぶ。
 * docs/features/cron.md、docs/cloudflare-d1-migration-plan.md §4-7 を参照。
 */

export const CHECK_NEW_BOOKS_PATH = "/api/cron/check-new-books";

/** Workers の環境（バインディング・変数・secret）のうち、Cron が使うもの。 */
export type CronEnv = {
  /** Bearer 認証の値（Worker の secret。値はログに出さない）。 */
  CRON_SECRET?: string;
  /** 内部リクエストの URL の origin。未設定なら http://localhost。 */
  CRON_TARGET_ORIGIN?: string;
};

type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };
type AppFetch<Env extends CronEnv> = (request: Request, env: Env, ctx: ExecutionContextLike) => Promise<Response>;
type ScheduledController = { cron: string; scheduledTime?: number };

const DEFAULT_ORIGIN = "http://localhost";

/**
 * `scheduled` ハンドラを作る。
 * - `CRON_SECRET` が未設定なら、API を呼ばずに失敗させる（ダッシュボード上で失敗として見える）。
 * - API が 2xx 以外を返した場合も失敗にする。Cloudflare の Cron は自動で再試行しないため、
 *   失敗は次の定時実行（API は重複通知を作らない冪等な作りなので、再実行しても安全）まで持ち越される。
 */
export function createScheduledHandler<Env extends CronEnv>(appFetch: AppFetch<Env>) {
  return async (controller: ScheduledController, env: Env, ctx: ExecutionContextLike): Promise<void> => {
    if (!env.CRON_SECRET) {
      console.error(JSON.stringify({ level: "error", msg: "CRON_SECRET is not configured", cron: controller.cron }));
      throw new Error("CRON_SECRET is not configured");
    }

    const request = new Request(new URL(CHECK_NEW_BOOKS_PATH, env.CRON_TARGET_ORIGIN ?? DEFAULT_ORIGIN), {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
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
