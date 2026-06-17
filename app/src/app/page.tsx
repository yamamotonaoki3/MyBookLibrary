import Link from "next/link";
import { BookOpen, Star, TrendingUp, Clock, ThumbsUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { RecentReadCard } from "./_components/RecentReadCard";
import { CollapsibleCard } from "./_components/CollapsibleCard";

export default async function Home() {
  const session = await auth();
  const userId = Number(session!.user.id);
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
        where: { userId: userId, status: "read", bookId: { in: bookIds } },
      });
      const pct = total > 0 ? Math.round((read / total) * 100) : 0;
      return { id: award.id, name: award.name, total, read, pct };
    })
  );

  const allBookIds = awards.flatMap((a) => a.awardEntries.map((e) => e.bookId));
  const uniqueBookIds = [...new Set(allBookIds)];
  const totalAll = uniqueBookIds.length;
  const readAll = await prisma.readingStatus.count({
    where: { userId: userId, status: "read", bookId: { in: uniqueBookIds } },
  });
  const pctAll = totalAll > 0 ? Math.round((readAll / totalAll) * 100) : 0;

  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId: userId },
    take: 3,
    include: {
      author: {
        include: {
          books: {
            include: {
              readingStatuses: {
                where: { userId: userId },
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
    const dbRead = fa.author.books.filter((b) => b.readingStatuses[0]?.status === "read").length;
    const pct = dbTotal > 0 ? Math.round((dbRead / dbTotal) * 100) : 0;
    return { id: fa.id, authorId: fa.authorId, name: fa.author.name, dbTotal, dbRead, pct };
  });

  const favoriteAuthorIds = new Set(favoriteAuthors.map((fa) => fa.authorId));
  const othersStatuses = await prisma.readingStatus.findMany({
    where: { userId: userId, book: { authorId: { notIn: [...favoriteAuthorIds] } } },
    select: { status: true },
  });
  const othersTotal = othersStatuses.length;
  const othersRead = othersStatuses.filter((s) => s.status === "read").length;
  const othersPct = othersTotal > 0 ? Math.round((othersRead / othersTotal) * 100) : 0;

  const [recentReads, myReviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: { userId: userId, status: { in: ["reading", "read"] } },
      orderBy: { updatedAt: "desc" },
      include: { book: { include: { author: true } } },
    }),
    prisma.review.findMany({
      where: { userId: userId },
      select: { bookId: true },
    }),
  ]);

  const reviewedBookIds = new Set(myReviews.map((r) => r.bookId));

  const [totalBooks, totalReadBooks, totalAuthors, totalLikesReceived] = await Promise.all([
    prisma.readingStatus.count({ where: { userId: userId } }),
    prisma.readingStatus.count({ where: { userId: userId, status: "read" } }),
    prisma.favoriteAuthor.count({ where: { userId: userId } }),
    prisma.like.count({ where: { review: { userId: userId } } }),
  ]);

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-5 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        ダッシュボード
      </h1>

      {/* 統計カード: モバイルは3列グリッド / PC は各カラムの上に配置するため非表示 */}
      <div className="mb-5 grid grid-cols-3 gap-3 lg:hidden">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 p-3 text-white shadow-md">
          <BookOpen className="h-5 w-5 opacity-80" />
          <p className="text-lg font-bold leading-none">{totalBooks}</p>
          <p className="text-[10px] opacity-75">登録冊数</p>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 p-3 text-white shadow-md">
          <Star className="h-5 w-5 opacity-80" />
          <p className="text-lg font-bold leading-none">{totalAuthors}</p>
          <p className="text-[10px] opacity-75">お気に入り著者</p>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 p-3 text-white shadow-md">
          <ThumbsUp className="h-5 w-5 opacity-80" />
          <p className="text-lg font-bold leading-none">{totalLikesReceived}</p>
          <p className="text-[10px] opacity-75">いいね数</p>
        </div>
      </div>

      {/* モバイル: 縦積みコンテンツ */}
      <div className="flex flex-col gap-4 lg:hidden">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />読書進捗
            </CardTitle>
          </CardHeader>
          <CardContent>
            {awardProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">賞データがまだ登録されていません。</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-semibold">全賞合計</span>
                    <span className="tabular-nums text-muted-foreground text-xs">{readAll} / {totalAll}冊 · {pctAll}%</span>
                  </div>
                  <Progress value={pctAll} className="h-2" />
                </div>
                <Separator />
                {awardProgress.map((award) => (
                  <Link key={award.id} href={`/awards?awardId=${award.id}`} className="group block">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-muted-foreground">{award.name}</span>
                      <span className="tabular-nums text-muted-foreground text-xs">{award.read} / {award.total}冊 · {award.pct}%</span>
                    </div>
                    <Progress value={award.pct} className="h-1.5" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <CollapsibleCard
          title="お気に入り著者"
          icon={<Star className="h-3.5 w-3.5" />}
          footer={
            <Link href="/favorite-authors" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              著者一覧を見る →
            </Link>
          }
        >
          {favoriteAuthorsWithProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだお気に入り著者がいません。</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {favoriteAuthorsWithProgress.map((fa) => (
                <li key={fa.authorId}>
                  <Link href={`/favorite-authors/${fa.authorId}`} className="text-sm font-medium hover:text-muted-foreground">
                    {fa.name}
                  </Link>
                  {fa.dbTotal > 0 && (
                    <div className="mt-1.5">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{fa.dbRead} / {fa.dbTotal}冊 読了</span>
                        <span>{fa.pct}%</span>
                      </div>
                      <Progress value={fa.pct} className="h-1" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title="読書記録"
          icon={<Clock className="h-3.5 w-3.5" />}
          badge={`${totalReadBooks}冊読了 / ${totalBooks}冊登録`}
        >
          {recentReads.length === 0 ? (
            <p className="text-sm text-muted-foreground">読書中・読了の本がまだありません。</p>
          ) : (
            <ul className="flex flex-col divide-y">
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
        </CollapsibleCard>
      </div>

      {/* PC: 3カラム固定高さ */}
      <div className="hidden lg:flex lg:flex-1 lg:gap-6 lg:overflow-hidden">

        {/* カラム1: 登録冊数 + 読書進捗 */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 p-5 text-white shadow-lg shadow-orange-200">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-white/75">登録冊数</p>
              <p className="text-2xl font-bold">{totalBooks}<span className="ml-1 text-sm font-normal">冊</span></p>
            </div>
          </div>
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                <TrendingUp className="h-4 w-4" />読書進捗
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {awardProgress.length === 0 ? (
                <p className="text-sm text-muted-foreground">賞データがまだ登録されていません。</p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold">全賞合計</span>
                      <span className="tabular-nums text-muted-foreground">{readAll} / {totalAll}冊 · {pctAll}%</span>
                    </div>
                    <Progress value={pctAll} className="h-2" />
                  </div>
                  <Separator />
                  {awardProgress.map((award) => (
                    <Link key={award.id} href={`/awards?awardId=${award.id}`} className="group block">
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium transition-colors group-hover:text-foreground text-muted-foreground">{award.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground text-xs">{award.read} / {award.total}冊 · {award.pct}%</span>
                      </div>
                      <Progress value={award.pct} className="h-1.5" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* カラム2: お気に入り著者数 + お気に入り著者 */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 p-5 text-white shadow-lg shadow-purple-200">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-white/75">お気に入り著者</p>
              <p className="text-2xl font-bold">{totalAuthors}<span className="ml-1 text-sm font-normal">人</span></p>
            </div>
          </div>
          <CollapsibleCard
            title="お気に入り著者"
            icon={<Star className="h-4 w-4" />}
            className="flex flex-1 flex-col overflow-hidden"
            contentClassName="flex flex-1 flex-col overflow-hidden"
            footer={
              <Link href="/favorite-authors" className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                著者一覧を見る →
              </Link>
            }
          >
            <div className="flex-1 overflow-y-auto">
              {favoriteAuthorsWithProgress.length === 0 ? (
                <p className="text-sm text-muted-foreground">まだお気に入り著者がいません。</p>
              ) : (
                <ul className="flex flex-col gap-5">
                  {favoriteAuthorsWithProgress.map((fa) => (
                    <li key={fa.authorId}>
                      <Link href={`/favorite-authors/${fa.authorId}`} className="text-sm font-medium transition-colors hover:text-muted-foreground">
                        {fa.name}
                      </Link>
                      {fa.dbTotal > 0 && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>{fa.dbRead} / {fa.dbTotal}冊 読了</span>
                            <span>{fa.pct}%</span>
                          </div>
                          <Progress value={fa.pct} className="h-1" />
                        </div>
                      )}
                    </li>
                  ))}
                  {othersTotal > 0 && (
                    <li>
                      <span className="text-sm font-medium text-muted-foreground">その他</span>
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>{othersRead} / {othersTotal}冊 読了</span>
                          <span>{othersPct}%</span>
                        </div>
                        <Progress value={othersPct} className="h-1" />
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </CollapsibleCard>
        </div>

        {/* カラム3: いいね数 + 読書記録 */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="shrink-0 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 p-5 text-white shadow-lg shadow-blue-200">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <ThumbsUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-white/75">いいね数</p>
              <p className="text-2xl font-bold">{totalLikesReceived}<span className="ml-1 text-sm font-normal">件</span></p>
            </div>
          </div>
          <CollapsibleCard
            title="読書記録"
            icon={<Clock className="h-4 w-4" />}
            badge={`${totalReadBooks}冊読了 / ${totalBooks}冊登録`}
            className="flex flex-1 flex-col overflow-hidden"
            contentClassName="flex-1 overflow-y-auto"
          >
            {recentReads.length === 0 ? (
              <p className="text-sm text-muted-foreground">読書中・読了の本がまだありません。</p>
            ) : (
              <ul className="flex flex-col divide-y">
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
          </CollapsibleCard>
        </div>

      </div>
    </div>
  );
}
