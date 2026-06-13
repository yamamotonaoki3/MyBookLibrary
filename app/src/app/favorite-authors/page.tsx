import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getAuthorBookCount } from "@/lib/rakuten";
import { AuthorCard } from "./_components/AuthorCard";
import { AddAuthorDialog } from "./_components/AddAuthorDialog";
import type { FavoriteAuthorItem } from "@/types/author";

export const dynamic = "force-dynamic";

async function FavoriteAuthorList() {
  const session = await auth();
  const userId = Number(session!.user.id);

  const favoriteAuthors = await prisma.favoriteAuthor.findMany({
    where: { userId },
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
                where: { userId },
                select: { status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { author: { name: "asc" } },
  });

  const bookCounts: number[] = [];
  for (const f of favoriteAuthors) {
    bookCounts.push(await getAuthorBookCount(f.author.name));
  }

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
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mb-5 flex shrink-0 items-center justify-between lg:mb-6">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          お気に入り著者
        </h1>
        <AddAuthorDialog />
      </div>

      <div className="flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <p className="text-center text-gray-500">読み込み中...</p>
          }
        >
          <FavoriteAuthorList />
        </Suspense>
      </div>
    </main>
  );
}
