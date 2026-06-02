import type { BookWithAwardEntry } from "@/types/award";
import { BookCard } from "./BookCard";
import { prisma } from "@/lib/prisma";

type Props = {
  awardId: number;
  year?: number;
};

export async function BookList({ awardId, year }: Props) {
  const awardEntries = await prisma.awardEntry.findMany({
    where: {
      awardId,
      ...(year !== undefined ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { type: "asc" }],
    select: {
      id: true,
      year: true,
      type: true,
      book: {
        select: {
          id: true,
          title: true,
          coverImageUrl: true,
          publishedAt: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const entries: BookWithAwardEntry[] = awardEntries.map((entry) => ({
    awardEntryId: entry.id,
    year: entry.year,
    type: entry.type,
    book: {
      id: entry.book.id,
      title: entry.book.title,
      coverImageUrl: entry.book.coverImageUrl,
      publishedAt: entry.book.publishedAt.toISOString(),
      author: {
        id: entry.book.author.id,
        name: entry.book.author.name,
      },
    },
  }));

  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        該当する作品が見つかりませんでした。
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <BookCard key={entry.awardEntryId} entry={entry} />
      ))}
    </div>
  );
}
