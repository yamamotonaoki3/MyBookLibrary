/** Promise の解決・シリアライズ・テストの比較などでランタイムが問い合わせる、クライアントのメンバーではない名前。 */
const NOT_A_MEMBER = new Set(["then", "toJSON", "$$typeof", "nodeType", "asymmetricMatch"]);

/**
 * D1 用のクライアントを、バインディングごとに生成・再利用する遅延解決の Proxy にする。
 *
 * Workers ではバインディングがリクエスト内でしか得られず、モジュールの読み込み時には存在しない。
 * そのため `prisma.user.findMany()` のようなアクセスのたびにバインディングを取得し、
 * 同じバインディングなら生成済みのクライアントを使い回し、変わったら作り直す。
 * 既存コードの `prisma.xxx` をそのまま使えるようにするためのしくみ。
 */
export function createPerBindingProxy<TClient extends object>(
  getBinding: () => object,
  createClient: (binding: object) => TClient
): TClient {
  let cached: { binding: object; client: TClient } | undefined;

  const resolve = (): TClient => {
    const binding = getBinding();
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
      const client = resolve() as Record<string | symbol, unknown>;
      const value = client[property];
      // メソッド（$transaction・$disconnect 等）は、クライアント自身を this にして呼べるようにする
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
  });
}
