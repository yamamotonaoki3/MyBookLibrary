import { prisma } from "@/lib/prisma";

// Prisma.PrismaClientKnownRequestErrorのinstanceof判定は、Next.js dev server の
// ホットリロードで「@/generated/prisma」モジュールが多重ロードされた場合に、
// クラスの同一性が崩れて一致しなくなることがある（本番ビルドでは発生しない）。
// そのため、他の一意制約違反判定と異なり、ここでは code プロパティのみで判定する。
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export type BookIsbnCandidate = {
  isbn: string;
  source?: string;
};

/**
 * 指定した Book のISBNを代表ISBN(isPrimary)として設定する。
 * 既存の代表ISBNは非代表に戻してから更新するため、常に代表は1件のみになる。
 * isbn が bookId に紐づく BookIsbn としてまだ登録されていない場合は例外を投げる。
 */
export async function setPrimaryIsbn(bookId: number, isbn: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.bookIsbn.findUnique({ where: { isbn } });
    if (!target || target.bookId !== bookId) {
      throw new Error(`ISBN ${isbn} は Book ${bookId} に登録されていません`);
    }

    await tx.bookIsbn.updateMany({
      where: { bookId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.bookIsbn.update({
      where: { isbn },
      data: { isPrimary: true },
    });
  });
}

/**
 * 候補ISBNをまとめて BookIsbn へ追加する。
 * 他の Book に既に紐づいている ISBN（Unique制約違反）は個別にスキップし、
 * 同時登録などによる競合が他の候補の保存を巻き込まないようにする。
 */
export async function addIsbns(
  bookId: number,
  candidates: BookIsbnCandidate[],
  options?: { primaryIsbn?: string }
): Promise<void> {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const isbn = candidate.isbn?.trim();
    if (!isbn || seen.has(isbn)) continue;
    seen.add(isbn);

    try {
      await prisma.bookIsbn.create({
        data: {
          bookId,
          isbn,
          isPrimary: options?.primaryIsbn === isbn,
          source: candidate.source ?? "rakuten",
        },
      });
    } catch (err) {
      // 他Bookに既に紐づくISBN、または同時登録による重複はスキップする
      if (isUniqueConstraintError(err)) {
        continue;
      }
      throw err;
    }
  }
}

export async function listIsbns(bookId: number) {
  return prisma.bookIsbn.findMany({
    where: { bookId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}
