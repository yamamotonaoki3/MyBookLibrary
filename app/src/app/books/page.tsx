import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { BookCard } from "./_components/BookCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "本一覧 | MyBookLibrary",
};

const TEMP_USER_ID = 1;

async function BookGrid() {
  const books = await prisma.book.findMany({
    include: {
      author: { select: { name: true } },
      readingStatuses: {
        where: { userId: TEMP_USER_ID },
        select: { status: true },
        take: 1,
      },
    },
    orderBy: { title: "asc" },
  });

  if (books.length === 0) {
    return <p className="text-zinc-500">書籍データが登録されていません。</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={{
            id: book.id,
            title: book.title,
            coverImageUrl: book.coverImageUrl,
            isbn: book.isbn,
            publishedAt: book.publishedAt.toISOString(),
            author: { name: book.author.name },
          }}
          initialStatus={
            (book.readingStatuses[0]?.status as
              | "unread"
              | "want_to_read"
              | "reading"
              | "read") ?? "unread"
          }
        />
      ))}
    </div>
  );
}

export default function BooksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        本一覧
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
