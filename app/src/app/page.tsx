import Link from "next/link";
import { prisma } from "@/lib/prisma";

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

  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId: TEMP_USER_ID },
    take: 3,
    include: { author: true },
  });

  const recentReads = await prisma.readingStatus.findMany({
    where: { userId: TEMP_USER_ID, status: "reading" },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      book: {
        include: { author: true },
      },
    },
  });

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
            ⭐ お気に入り著者
          </h2>
          {favoriteAuthors.length === 0 ? (
            <p className="text-sm text-zinc-500">
              まだお気に入り著者がいません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {favoriteAuthors.map((fa) => (
                <li key={fa.authorId}>
                  <Link
                    href={`/favorite-authors/${fa.authorId}`}
                    className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {fa.author.name} →
                  </Link>
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
              読書中の本がまだありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentReads.map((rs) => (
                <li key={rs.id}>
                  <Link
                    href={`/books/${rs.bookId}`}
                    className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {rs.book.title}
                  </Link>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {rs.book.author.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
