import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
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
      <p className="text-zinc-500">
        該当する本がありません。
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

type Props = {
  searchParams: Promise<{ status?: string; author?: string }>;
};

export default async function BooksPage({ searchParams }: Props) {
  const { status = "all", author = "all" } = await searchParams;

  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId: TEMP_USER_ID },
    include: { author: { select: { name: true } } },
  });
  const favoriteAuthorList = favoriteAuthors.map((fa) => ({
    id: fa.authorId,
    name: fa.author.name,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        私の本一覧
      </h1>

      <BooksFilter favoriteAuthors={favoriteAuthorList} />

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
        <BookGrid
          status={status}
          author={author}
          favoriteAuthorIds={favoriteAuthorList.map((a) => a.id)}
        />
      </Suspense>
    </div>
  );
}
