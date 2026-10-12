import { prisma } from "@/lib/prisma";
import { atomically, d1Timestamp, type AtomicStep } from "@/lib/atomically";
import { chunk } from "@/lib/chunk";

/** 受賞登録の削除 1 回あたりの（賞, 年度）の組み合わせの数。1 組で 2 個、統合元の本の ID で 1 個のバインドパラメータを使う。 */
const AWARD_ENTRY_PAIRS_PER_DELETE = 30;

/**
 * 手動登録の本（統合元）を別の本（統合先）へ統合する。
 *
 * 統合先に既にある行と重複する統合元の行（同一ユーザーの読書状況・同一の賞と年度の受賞）を破棄し、
 * 残りを統合先へ付け替え、最後に統合元の本を削除する。これらを 1 つの原子的な単位で実行する。
 * 統合先の受賞登録だけは事前に読み取って重複を特定する。その後に競合が起きた場合は、
 * 一意制約違反で全体が失敗し、再実行できる。
 */
export async function mergeManualBook(params: { sourceBookId: number; targetBookId: number }): Promise<void> {
  const { sourceBookId, targetBookId } = params;

  const targetEntries = await prisma.awardEntry.findMany({
    where: { bookId: targetBookId },
    select: { awardId: true, year: true },
  });
  const now = d1Timestamp();

  const steps: AtomicStep[] = [
    // ReadingStatus: 統合先に同一ユーザーの行が既にあれば統合元の行を破棄し、残りを付け替える
    {
      prisma: () =>
        prisma.readingStatus.deleteMany({
          where: {
            bookId: sourceBookId,
            user: { readingStatuses: { some: { bookId: targetBookId } } },
          },
        }),
      d1: {
        sql: `DELETE FROM reading_statuses
              WHERE book_id = ? AND user_id IN (SELECT user_id FROM reading_statuses WHERE book_id = ?)`,
        params: [sourceBookId, targetBookId],
      },
    },
    {
      prisma: () =>
        prisma.readingStatus.updateMany({ where: { bookId: sourceBookId }, data: { bookId: targetBookId } }),
      d1: {
        sql: "UPDATE reading_statuses SET book_id = ?, updated_at = ? WHERE book_id = ?",
        params: [targetBookId, now, sourceBookId],
      },
    },
  ];

  // AwardEntry: 統合先に同一の賞・年度の組み合わせが既にあれば統合元の行を破棄し、残りを付け替える
  // 組み合わせの数に比例して条件が増え、D1 のバインドパラメータの上限（100 個）を超えるため、一定数ごとの削除に分ける
  for (const entries of chunk(targetEntries, AWARD_ENTRY_PAIRS_PER_DELETE)) {
    steps.push({
      prisma: () =>
        prisma.awardEntry.deleteMany({
          where: {
            bookId: sourceBookId,
            OR: entries.map((e) => ({ awardId: e.awardId, year: e.year })),
          },
        }),
      d1: {
        sql: `DELETE FROM award_entries
              WHERE book_id = ? AND (${entries.map(() => "(award_id = ? AND year = ?)").join(" OR ")})`,
        params: [sourceBookId, ...entries.flatMap((e) => [e.awardId, e.year])],
      },
    });
  }

  steps.push(
    {
      prisma: () => prisma.awardEntry.updateMany({ where: { bookId: sourceBookId }, data: { bookId: targetBookId } }),
      d1: { sql: "UPDATE award_entries SET book_id = ? WHERE book_id = ?", params: [targetBookId, sourceBookId] },
    },
    // Review: 一意制約が無いためそのまま付け替える
    {
      prisma: () => prisma.review.updateMany({ where: { bookId: sourceBookId }, data: { bookId: targetBookId } }),
      d1: { sql: "UPDATE reviews SET book_id = ? WHERE book_id = ?", params: [targetBookId, sourceBookId] },
    },
    {
      prisma: () => prisma.book.delete({ where: { id: sourceBookId } }),
      d1: { sql: "DELETE FROM books WHERE id = ?", params: [sourceBookId] },
      requireRow: true,
    }
  );

  await atomically(steps);
}
