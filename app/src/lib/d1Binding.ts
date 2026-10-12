/**
 * D1 のバインディング（`env.DB`）を取得する。DB_PROVIDER=d1 のときだけ使われる。
 *
 * Workers 上では、OpenNext がリクエストごとに設定するグローバルの Cloudflare コンテキスト
 * （`Symbol.for("__cloudflare-context__")`。`@opennextjs/cloudflare` の `getCloudflareContext` と同じ場所）から取る。
 * Node.js 上のスクリプトやテストでは、`registerD1Binding` で登録したものを使う（miniflare の `getPlatformProxy` 等）。
 */

/** D1 のバインディング。`@prisma/adapter-d1` の `PrismaD1` に渡せる値（型はここでは緩く扱う）。 */
export type D1BindingLike = object;

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const D1_BINDING_NAME = "DB";

let registered: D1BindingLike | undefined;

export function registerD1Binding(binding: D1BindingLike | undefined): void {
  registered = binding;
}

export function getD1Binding(): D1BindingLike {
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[CLOUDFLARE_CONTEXT];
  const fromContext = context?.env?.[D1_BINDING_NAME];
  if (fromContext && typeof fromContext === "object") return fromContext;
  if (registered) return registered;
  throw new Error(
    `D1 のバインディング（${D1_BINDING_NAME}）が見つかりません。Workers 上のリクエスト内で呼び出すか、registerD1Binding で登録してください。`
  );
}
