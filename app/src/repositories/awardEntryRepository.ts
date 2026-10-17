import { prisma } from "@/lib/prisma";
import { atomically, type AtomicStep, type D1Statement } from "@/lib/atomically";
import { flatMapInChunks } from "@/lib/chunk";

/**
 * 管理画面の「受賞登録一覧」用に、受賞登録を、本・著者・賞・ISBN つきで全件取り出す。
 *
 * 本の ISBN（1 対多）を `include` で一緒に読むと、Prisma が全件の本 ID を `IN (...)` に並べ、
 * D1 の 1 クエリの変数の上限（100 個）を超えて失敗する（受賞登録が 100 件を超えると）。
 * そのため、ISBN は本 ID を分けて取り、本ごとにまとめる。応答の形は、`include` のときと同じ。
 * （本・著者・賞は、1 対 1 の関連で、JOIN で読むため、上限に当たらない）
 */
export async function listAwardEntriesForAdmin() {
  const entries = await prisma.awardEntry.findMany({
    include: { book: { include: { author: true } }, award: true },
    orderBy: [{ award: { name: "asc" } }, { year: "desc" }],
  });

  const bookIds = [...new Set(entries.map((entry) => entry.bookId))];
  const isbns = await flatMapInChunks(bookIds, (ids) =>
    prisma.bookIsbn.findMany({
      where: { bookId: { in: ids } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    })
  );
  const isbnsByBookId = new Map<number, typeof isbns>();
  for (const isbn of isbns) {
    const list = isbnsByBookId.get(isbn.bookId);
    if (list) list.push(isbn);
    else isbnsByBookId.set(isbn.bookId, [isbn]);
  }

  return entries.map((entry) => ({
    ...entry,
    book: { ...entry.book, bookIsbns: isbnsByBookId.get(entry.bookId) ?? [] },
  }));
}

export type BookFieldChanges = { title?: string; authorId?: number };
export type AwardEntryFieldChanges = { type?: string; year?: number; awardId?: number };

/** `UPDATE <table> SET col = ?, ... WHERE id = ?` を作る。 */
function updateById(table: string, columns: Record<string, unknown>, id: number): D1Statement {
  const entries = Object.entries(columns);
  return {
    sql: `UPDATE ${table} SET ${entries.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`,
    params: [...entries.map(([, value]) => value), id],
  };
}

/**
 * 本の項目（タイトル・著者）と受賞登録の項目（区分・年度・賞）を、原子的に更新する。
 * 変更のない側は更新しない。どちらも変更がなければ何もしない。
 */
export async function updateBookAndAwardEntry(params: {
  bookId: number;
  entryId: number;
  book: BookFieldChanges;
  entry: AwardEntryFieldChanges;
}): Promise<void> {
  const { bookId, entryId, book, entry } = params;
  const steps: AtomicStep[] = [];

  const bookColumns = {
    ...(book.title !== undefined && { title: book.title }),
    ...(book.authorId !== undefined && { author_id: book.authorId }),
  };
  if (Object.keys(bookColumns).length > 0) {
    steps.push({
      prisma: () => prisma.book.update({ where: { id: bookId }, data: book }),
      d1: updateById("books", bookColumns, bookId),
      requireRow: true,
    });
  }

  const entryColumns = {
    ...(entry.type !== undefined && { type: entry.type }),
    ...(entry.year !== undefined && { year: entry.year }),
    ...(entry.awardId !== undefined && { award_id: entry.awardId }),
  };
  if (Object.keys(entryColumns).length > 0) {
    steps.push({
      prisma: () => prisma.awardEntry.update({ where: { id: entryId }, data: entry }),
      d1: updateById("award_entries", entryColumns, entryId),
      requireRow: true,
    });
  }

  if (steps.length > 0) await atomically(steps);
}
