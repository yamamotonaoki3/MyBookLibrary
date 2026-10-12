/**
 * Prisma の一意制約違反（P2002）かどうかを、`code` プロパティだけで判定する。
 *
 * `Prisma.PrismaClientKnownRequestError` の instanceof 判定は、Next.js の開発サーバーのホットリロードで
 * 生成クライアントが多重に読み込まれると、クラスの同一性が崩れて一致しなくなることがある（本番ビルドでは起きない）。
 * また MySQL 用と D1 用の 2 つの生成クライアントがあるため、どちらのエラーでも判定できるよう code で見る。
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
