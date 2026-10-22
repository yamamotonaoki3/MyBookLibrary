import { getPublicReviewCounts } from "@/lib/bookReviewSummary";
import { prisma } from "@/lib/prisma";
import type { BookWithAwardEntry, ReadingStatus } from "@/types/award";

type Params = {
  awardId: number | "all";
  year?: number;
  userId: number;
};

/**
 * 賞別一覧の作品リスト（受賞・候補の一覧と、ログイン中のユーザーの読書状況・感想の有無）を返す。
 * 読書状況を作品ごとの入れ子（`where` + `take` 付きのリレーション）で取ると、作品が 100 件前後を超えたとき、
 * D1 のバインドパラメータの上限（100 個）を超えて失敗する（Prisma が自動で分割できない形）。
 * そのため、ユーザーの読書状況と感想を、作品の ID を条件に含めない別のクエリで取り、手元で結び付ける。
 */
export async function getAwardBookEntries({ awardId, year, userId }: Params): Promise<BookWithAwardEntry[]> {
  const showAll = awardId === "all";

  const awardEntries = await prisma.awardEntry.findMany({
    where: {
      ...(showAll ? {} : { awardId }),
      ...(year !== undefined ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { type: "asc" }],
    select: {
      id: true,
      year: true,
      type: true,
      award: showAll ? { select: { name: true } } : false,
      book: {
        select: {
          id: true,
          title: true,
          isbn: true,
          coverImageUrl: true,
          publishedAt: true,
          author: { select: { id: true, name: true } },
        },
      },
    },
  });

  const statusByBookId = new Map(
    (await prisma.readingStatus.findMany({ where: { userId }, select: { bookId: true, status: true } })).map((row) => [row.bookId, row.status])
  );
  const reviewedBookIds = new Set(
    (await prisma.review.findMany({ where: { userId }, select: { bookId: true } })).map((review) => review.bookId)
  );

  const publicCounts = await getPublicReviewCounts(awardEntries.map(entry => entry.book.id));
  return awardEntries.map((entry) => ({
    awardEntryId: entry.id,
    year: entry.year,
    type: entry.type,
    awardName: showAll && "award" in entry && entry.award ? (entry.award as { name: string }).name : undefined,
    status: (statusByBookId.get(entry.book.id) ?? "unread") as ReadingStatus,
    hasReview: reviewedBookIds.has(entry.book.id),
    book: {
      publicReviewCount: publicCounts.get(entry.book.id) ?? 0,
      id: entry.book.id,
      title: entry.book.title,
      isbn: entry.book.isbn,
      coverImageUrl: entry.book.coverImageUrl,
      publishedAt: entry.book.publishedAt.toISOString(),
      author: { id: entry.book.author.id, name: entry.book.author.name },
    },
  }));
}
