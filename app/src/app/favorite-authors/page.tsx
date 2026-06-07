import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getAuthorBookCount } from "@/lib/rakuten";
import { AuthorCard } from "./_components/AuthorCard";
import { AddAuthorDialog } from "./_components/AddAuthorDialog";
import type { FavoriteAuthorItem } from "@/types/author";

export const dynamic = "force-dynamic";

async function FavoriteAuthorList() {
  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId: 1 },
    select: {
      id: true,
      authorId: true,
      notify: true,
      author: {
        select: {
          name: true,
          books: {
            select: {
              readingStatuses: {
                where: { userId: 1 },
                select: { status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { author: { name: "asc" } },
  });

  const bookCounts = await Promise.all(
    favoriteAuthors.map((f) => getAuthorBookCount(f.author.name))
  );

  const authors: FavoriteAuthorItem[] = favoriteAuthors.map((f, i) => ({
    id: f.id,
    authorId: f.authorId,
    authorName: f.author.name,
    bookCount: bookCounts[i],
    readingCount: f.author.books.reduce(
      (sum, b) => sum + b.readingStatuses.filter((s) => s.status === "reading").length,
      0
    ),
    readCount: f.author.books.reduce(
      (sum, b) => sum + b.readingStatuses.filter((s) => s.status === "read").length,
      0
    ),
    notify: f.notify,
  }));

  if (authors.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-16">
        お気に入り著者がまだ登録されていません
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {authors.map((author) => (
        <li key={author.id}>
          <AuthorCard author={author} />
        </li>
      ))}
    </ul>
  );
}

export default function FavoriteAuthorsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          お気に入り著者
        </h1>
        <AddAuthorDialog />
      </div>

      <Suspense
        fallback={
          <p className="text-center text-gray-500">読み込み中...</p>
        }
      >
        <FavoriteAuthorList />
      </Suspense>
    </main>
  );
}
