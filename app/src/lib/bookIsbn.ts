import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { isUniqueConstraintError } from "@/lib/prismaErrors";
import { flatMapInChunks } from "@/lib/chunk";


export type BookIsbnCandidate = {
  isbn: string;
  source?: string;
};

/**
 * 指定した Book のISBNを代表ISBN(isPrimary)として設定する。
 * その Book の全ISBNの isPrimary を 1 つの UPDATE で付け替えるため、常に代表は1件のみになる
 * （複数文のトランザクションを使わず原子化する。docs/archive/cloudflare-d1-migration-plan.md §5-3）。
 * isbn が bookId に紐づく BookIsbn としてまだ登録されていない場合は例外を投げる。
 */
export async function setPrimaryIsbn(bookId: number, isbn: string): Promise<void> {
  const target = await prisma.bookIsbn.findUnique({ where: { isbn } });
  if (!target || target.bookId !== bookId) {
    throw new Error(`ISBN ${isbn} は Book ${bookId} に登録されていません`);
  }

  await prisma.$executeRaw`
    UPDATE book_isbns SET is_primary = (isbn = ${isbn})
    WHERE book_id = ${bookId}
      AND EXISTS (
        SELECT 1 FROM (
          SELECT isbn FROM book_isbns
          WHERE isbn = ${isbn} AND book_id = ${bookId} LIMIT 1
        ) AS target_isbn
      )
  `;

  // LIMIT 付き導出テーブルで MySQL の 1093 を避ける。
  // 更新件数は同じ代表ISBNの再指定で 0 になり得るため、存在を別途確認する。
  const remaining = await prisma.bookIsbn.findUnique({ where: { isbn } });
  if (!remaining || remaining.bookId !== bookId) {
    throw new Error(`ISBN ${isbn} は Book ${bookId} に登録されていません`);
  }
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

export type BookIsbnEntry = {
  isbn: string;
  isPrimary: boolean;
};

export class BookIsbnConflictError extends Error {
  readonly code = "BOOK_ISBN_CONFLICT";

  constructor(readonly isbns: string[]) {
    super(`他のBookに登録済みのISBNが含まれています: ${isbns.join(", ")}`);
    this.name = "BookIsbnConflictError";
  }
}

export function isBookIsbnConflictError(error: unknown): error is BookIsbnConflictError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "BOOK_ISBN_CONFLICT"
  );
}

/**
 * 指定した Book のISBN一覧を、渡された一覧の内容で置き換える（追加・削除・代表ISBNの変更をまとめて反映する）。
 * isPrimary が true の要素が複数ある場合は先頭のものを代表として扱う。
 * 一覧が空の場合は Book.isbn を null にし、BookIsbn を全件削除する。
 * 他Bookに既に紐づくISBNが含まれる場合は、変更前に例外を投げる。
 * 複数の書き込みを含むが、再実行しても同じ結果に収束する（冪等）ため、トランザクションは要求しない。
 */
export async function replaceIsbns(
  tx: Prisma.TransactionClient,
  bookId: number,
  isbns: BookIsbnEntry[]
): Promise<void> {
  const deduped = new Map<string, boolean>();
  for (const { isbn, isPrimary } of isbns) {
    const trimmed = isbn.trim();
    if (!trimmed) continue;
    deduped.set(trimmed, deduped.get(trimmed) === true || isPrimary);
  }

  const primaryIsbn = [...deduped.entries()].find(([, isPrimary]) => isPrimary)?.[0]
    ?? [...deduped.keys()][0]
    ?? null;

  const targetIsbns = [...deduped.keys()];
  const [bookIsbnConflicts, legacyBookConflicts] = await Promise.all([
    flatMapInChunks(targetIsbns, (part) =>
      tx.bookIsbn.findMany({
        where: {
          isbn: { in: part },
          bookId: { not: bookId },
        },
        select: { isbn: true },
      })
    ),
    flatMapInChunks(targetIsbns, (part) =>
      tx.book.findMany({
        where: {
          id: { not: bookId },
          isbn: { in: part },
        },
        select: { isbn: true },
      })
    ),
  ]);
  const conflictingIsbns = new Set<string>();
  for (const { isbn } of bookIsbnConflicts) conflictingIsbns.add(isbn);
  for (const { isbn } of legacyBookConflicts) {
    if (isbn) conflictingIsbns.add(isbn);
  }
  if (conflictingIsbns.size > 0) {
    throw new BookIsbnConflictError([...conflictingIsbns]);
  }

  const existing = await tx.bookIsbn.findMany({ where: { bookId } });
  const keep = new Set(deduped.keys());
  const savedIsbns = new Set<string>();

  for (const row of existing) {
    if (!keep.has(row.isbn)) {
      await tx.bookIsbn.delete({ where: { isbn: row.isbn } });
    }
  }

  for (const isbn of deduped.keys()) {
    const current = await tx.bookIsbn.findUnique({ where: { isbn } });
    if (current && current.bookId !== bookId) {
      throw new BookIsbnConflictError([isbn]);
    }
    try {
      if (current) {
        await tx.bookIsbn.update({ where: { isbn }, data: { isPrimary: isbn === primaryIsbn } });
      } else {
        await tx.bookIsbn.create({
          data: { bookId, isbn, isPrimary: isbn === primaryIsbn, source: "manual" },
        });
      }
      savedIsbns.add(isbn);
    } catch (err) {
      // 事前検査後の同時登録による競合は、衝突として失敗にする（トランザクションは使わず、再実行で同じ結果に収束する）
      if (isUniqueConstraintError(err)) throw new BookIsbnConflictError([isbn]);
      throw err;
    }
  }

  const savedPrimaryIsbn = primaryIsbn && savedIsbns.has(primaryIsbn)
    ? primaryIsbn
    : (savedIsbns.values().next().value ?? null);

  await tx.bookIsbn.updateMany({
    where: { bookId, isPrimary: true },
    data: { isPrimary: false },
  });
  if (savedPrimaryIsbn) {
    await tx.bookIsbn.update({
      where: { isbn: savedPrimaryIsbn },
      data: { isPrimary: true },
    });
  }

  try {
    await tx.book.update({ where: { id: bookId }, data: { isbn: savedPrimaryIsbn } });
  } catch (err) {
    if (isUniqueConstraintError(err) && savedPrimaryIsbn) {
      throw new BookIsbnConflictError([savedPrimaryIsbn]);
    }
    throw err;
  }
}
