import { Suspense } from "react";
import { BookOpen, BookMarked, BookCheck, Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookCard } from "./_components/BookCard";
import { BooksFilter } from "./_components/BooksFilter";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "私の本一覧 | MyBookLibrary",
};

const TEMP_USER_ID = 1;

type BookGridProps = {
  status: string;
  author: string;
  favoriteAuthorIds: number[];
};

async function BookGrid({ status, author, favoriteAuthorIds }: BookGridProps) {
  const authorIdNum = Number(author);
  const authorFilter =
    !isNaN(authorIdNum) && author !== "all" && author !== "others"
      ? { book: { authorId: authorIdNum } }
      : author === "others"
        ? { book: { authorId: { notIn: favoriteAuthorIds } } }
        : {};

  const statusFilter =
    status !== "all" ? { status } : {};

  const [myStatuses, myReviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: { userId: TEMP_USER_ID, ...authorFilter, ...statusFilter },
      orderBy: { updatedAt: "desc" },
      include: {
        book: {
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.review.findMany({
      where: { userId: TEMP_USER_ID },
      select: { bookId: true },
    }),
  ]);

  const reviewedBookIds = new Set(myReviews.map((r) => r.bookId));

  if (myStatuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        該当する本がありません。
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {myStatuses.map((rs) => (
        <BookCard
          key={rs.bookId}
          book={{
            id: rs.book.id,
            title: rs.book.title,
            coverImageUrl: rs.book.coverImageUrl,
            isbn: rs.book.isbn,
            publishedAt: rs.book.publishedAt.toISOString(),
            author: { name: rs.book.author.name },
          }}
          initialStatus={
            rs.status as "unread" | "want_to_read" | "reading" | "read"
          }
          hasReview={reviewedBookIds.has(rs.bookId)}
        />
      ))}
    </div>
  );
}

type Props = {
  searchParams: Promise<{ status?: string; author?: string }>;
};

export default async function BooksPage({ searchParams }: Props) {
  const { status = "all", author = "all" } = await searchParams;

  const [favoriteAuthors, wantToRead, reading, read] = await Promise.all([
    prisma.favoriteAuthor.findMany({
      where: { userId: TEMP_USER_ID },
      include: { author: { select: { name: true } } },
    }),
    prisma.readingStatus.count({ where: { userId: TEMP_USER_ID, status: "want_to_read" } }),
    prisma.readingStatus.count({ where: { userId: TEMP_USER_ID, status: "reading" } }),
    prisma.readingStatus.count({ where: { userId: TEMP_USER_ID, status: "read" } }),
  ]);

  const favoriteAuthorList = favoriteAuthors.map((fa) => ({
    id: fa.authorId,
    name: fa.author.name,
  }));

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-5 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        私の本一覧
      </h1>

      {/* ステータスサマリー */}
      <div className="mb-6 shrink-0 grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 p-3 text-white shadow-md lg:flex-row lg:gap-3 lg:p-4">
          <Heart className="h-5 w-5 opacity-80 shrink-0" />
          <div className="text-center lg:text-left">
            <p className="text-lg font-bold leading-none">{wantToRead}</p>
            <p className="text-[10px] opacity-75 lg:text-xs">読みたい</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 p-3 text-white shadow-md lg:flex-row lg:gap-3 lg:p-4">
          <BookOpen className="h-5 w-5 opacity-80 shrink-0" />
          <div className="text-center lg:text-left">
            <p className="text-lg font-bold leading-none">{reading}</p>
            <p className="text-[10px] opacity-75 lg:text-xs">読書中</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 p-3 text-white shadow-md lg:flex-row lg:gap-3 lg:p-4">
          <BookCheck className="h-5 w-5 opacity-80 shrink-0" />
          <div className="text-center lg:text-left">
            <p className="text-lg font-bold leading-none">{read}</p>
            <p className="text-[10px] opacity-75 lg:text-xs">読了</p>
          </div>
        </div>
      </div>

      {/* フィルター + 一覧 */}
      <div className="flex-1 overflow-y-auto">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            <BookMarked className="h-4 w-4" />登録した本
          </CardTitle>
          <BooksFilter favoriteAuthors={favoriteAuthorList} />
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            }
          >
            <BookGrid
              status={status}
              author={author}
              favoriteAuthorIds={favoriteAuthorList.map((a) => a.id)}
            />
          </Suspense>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
