/** Promise の解決・シリアライズ・テストの比較などでランタイムが問い合わせる、クライアントのメンバーではない名前。 */
const NOT_A_MEMBER = new Set(["then", "toJSON", "$$typeof", "nodeType", "asymmetricMatch"]);

/**
 * D1 用のクライアントを、バインディングごとに生成・再利用する遅延解決の Proxy にする。
 *
 * Workers ではバインディングがリクエスト内でしか得られず、モジュールの読み込み時には存在しない。
 * そのため `prisma.user.findMany()` のようなアクセスのたびにバインディングを取得し、
 * 既存コードの `prisma.xxx` をそのまま使えるようにするためのしくみ。
 *
 * クライアントの使い回しの単位:
 *   - `getScope` がリクエストごとのオブジェクトを返すとき（Workers 上）… **リクエストごとに別のクライアント**を作り、リクエストをまたいで共有しない。
 *     Prisma のクライアントは、最初の問い合わせで始めた接続処理の待ち（Promise）を内部に保持し、あとから来たリクエストもそれを待つ。
 *     最初のリクエストが中断・終了すると、その待ちの続きが取り消され、待っていた別のリクエストが永久に待つ（Workers が「止まった」と中断する。#734）。
 *   - 返さないとき（Node.js 上のスクリプト・テスト）… 同じバインディングなら生成済みのクライアントを使い回し、変わったら作り直す。
 */
export function createPerBindingProxy<TClient extends object>(
  getBinding: () => object,
  createClient: (binding: object) => TClient,
  getScope?: () => object | undefined
): TClient {
  let cached: { binding: object; client: TClient } | undefined;
  // リクエストごとのクライアント。リクエストが終われば、キー（リクエストのコンテキスト）とともに回収される。
  const perScope = new WeakMap<object, TClient>();

  const resolve = (): TClient => {
    const binding = getBinding();
    const scope = getScope?.();
    if (scope) {
      let client = perScope.get(scope);
      if (!client) {
        client = createClient(binding);
        perScope.set(scope, client);
      }
      return client;
    }
    if (!cached || cached.binding !== binding) {
      cached = { binding, client: createClient(binding) };
    }
    return cached.client;
  };

  return new Proxy({} as TClient, {
    get(_target, property) {
      // `await prisma` や `Promise.resolve(prisma)` が `then` を問い合わせても、バインディングの解決（リクエスト外では例外）は起こさない。
      // Symbol（inspect・toPrimitive 等）も同様に、クライアントの有無に関係なく未定義として扱う。
      if (typeof property === "symbol" || NOT_A_MEMBER.has(property)) return undefined;
      // 切断は、バインディングを取得せずに、生成済みのクライアントがあればそれだけを切断する
      // （リクエスト外やテストの終了処理で呼ばれても例外にならない）。リクエスト内では、そのリクエストのクライアントを切断する。
      if (property === "$disconnect") {
        return async () => {
          const scope = getScope?.();
          let target: { $disconnect?: () => Promise<void> } | undefined;
          if (scope) {
            target = perScope.get(scope) as typeof target;
            perScope.delete(scope);
          } else {
            target = cached?.client as typeof target;
            cached = undefined;
          }
          await target?.$disconnect?.();
        };
      }
      const client = resolve() as Record<string | symbol, unknown>;
      const value = client[property];
      // メソッド（$transaction・$disconnect 等）は、クライアント自身を this にして呼べるようにする
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
  });
}
