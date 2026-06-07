import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { BookCard } from "./_components/BookCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "私の本一覧 | MyBookLibrary",
};

const TEMP_USER_ID = 1;

async function BookGrid() {
  const [myStatuses, myReviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: { userId: TEMP_USER_ID },
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
      <p className="text-zinc-500">
        まだ本が登録されていません。「本を探す」からステータスを設定してください。
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

export default function BooksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        私の本一覧
      </h1>

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
              />
            ))}
          </div>
        }
      >
        <BookGrid />
      </Suspense>
    </div>
  );
}
