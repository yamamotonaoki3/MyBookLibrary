import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { RecentReadCard } from "./_components/RecentReadCard";

const TEMP_USER_ID = 1;

export default async function Home() {
  const awards = await prisma.award.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      awardEntries: { select: { bookId: true } },
    },
  });

  const awardProgress = await Promise.all(
    awards.map(async (award) => {
      const bookIds = award.awardEntries.map((e) => e.bookId);
      const total = bookIds.length;
      const read = await prisma.readingStatus.count({
        where: {
          userId: TEMP_USER_ID,
          status: "read",
          bookId: { in: bookIds },
        },
      });
      const pct = total > 0 ? Math.round((read / total) * 100) : 0;
      return { id: award.id, name: award.name, total, read, pct };
    })
  );

  const allBookIds = awards.flatMap((a) => a.awardEntries.map((e) => e.bookId));
  const uniqueBookIds = [...new Set(allBookIds)];
  const totalAll = uniqueBookIds.length;
  const readAll = await prisma.readingStatus.count({
    where: {
      userId: TEMP_USER_ID,
      status: "read",
      bookId: { in: uniqueBookIds },
    },
  });
  const pctAll = totalAll > 0 ? Math.round((readAll / totalAll) * 100) : 0;

  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId: TEMP_USER_ID },
    take: 3,
    include: {
      author: {
        include: {
          books: {
            include: {
              readingStatuses: {
                where: { userId: TEMP_USER_ID },
                select: { status: true },
              },
            },
          },
        },
      },
    },
  });

  const favoriteAuthorsWithProgress = favoriteAuthors.map((fa) => {
    const dbTotal = fa.author.books.filter((b) => b.readingStatuses.length > 0).length;
    const dbRead = fa.author.books.filter(
      (b) => b.readingStatuses[0]?.status === "read"
    ).length;
    const pct = dbTotal > 0 ? Math.round((dbRead / dbTotal) * 100) : 0;
    return { id: fa.id, authorId: fa.authorId, name: fa.author.name, dbTotal, dbRead, pct };
  });

  const [recentReads, myReviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: { userId: TEMP_USER_ID, status: { in: ["reading", "read"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        book: { include: { author: true } },
      },
    }),
    prisma.review.findMany({
      where: { userId: TEMP_USER_ID },
      select: { bookId: true },
    }),
  ]);

  const reviewedBookIds = new Set(myReviews.map((r) => r.bookId));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        ダッシュボード
      </h1>

      {/* 読書進捗サマリー */}
      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          📊 読書進捗サマリー
        </h2>
        {awardProgress.length === 0 ? (
          <p className="text-sm text-zinc-500">賞データがまだ登録されていません。</p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 全賞合計 */}
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  全賞合計
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {readAll} / {totalAll}冊 ({pctAll}%)
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-3 rounded-full bg-zinc-900 transition-all dark:bg-zinc-50"
                  style={{ width: `${pctAll}%` }}
                />
              </div>
            </div>

            <div className="border-t border-zinc-100 dark:border-zinc-800" />

            {/* 各賞 */}
            {awardProgress.map((award) => (
              <Link
                key={award.id}
                href={`/awards?awardId=${award.id}`}
                className="group block"
              >
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-900 group-hover:underline dark:text-zinc-50">
                    {award.name}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {award.read} / {award.total}冊 ({award.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-2 rounded-full bg-zinc-900 transition-all dark:bg-zinc-50"
                    style={{ width: `${award.pct}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* お気に入り著者 */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
            ⭐ 私の読みたい本進捗
          </h2>
          {favoriteAuthorsWithProgress.length === 0 ? (
            <p className="text-sm text-zinc-500">
              まだお気に入り著者がいません。
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {favoriteAuthorsWithProgress.map((fa) => (
                <li key={fa.authorId}>
                  <Link
                    href={`/favorite-authors/${fa.authorId}`}
                    className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {fa.name} →
                  </Link>
                  {fa.dbTotal > 0 && (
                    <div className="mt-1">
                      <div className="mb-0.5 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{fa.dbRead} / {fa.dbTotal}冊 読了</span>
                        <span>{fa.pct}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-1.5 rounded-full bg-zinc-900 transition-all dark:bg-zinc-50"
                          style={{ width: `${fa.pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href="/favorite-authors"
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              著者一覧へ →
            </Link>
          </div>
        </section>

        {/* 最近の読書記録 */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
            📖 最近の読書記録
          </h2>
          {recentReads.length === 0 ? (
            <p className="text-sm text-zinc-500">
              読書中・読了の本がまだありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {recentReads.map((rs) => (
                <RecentReadCard
                  key={rs.id}
                  book={{
                    id: rs.bookId,
                    title: rs.book.title,
                    authorName: rs.book.author.name,
                    isbn: rs.book.isbn,
                    coverImageUrl: rs.book.coverImageUrl,
                    publishedAt: rs.book.publishedAt.toISOString(),
                  }}
                  initialStatus={rs.status as "unread" | "want_to_read" | "reading" | "read"}
                  hasReview={reviewedBookIds.has(rs.bookId)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
