import { prisma } from "@/lib/prisma";
import { atomically, type AtomicStep, type D1Statement } from "@/lib/atomically";

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
