import type { BookWithAwardEntry, ReadingStatus } from "@/types/award";
import { BookCard } from "./BookCard";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

type Props = {
  awardId: number | "all";
  year?: number;
};

export async function BookList({ awardId, year }: Props) {
  const showAll = awardId === "all";

  const awardEntries = await prisma.awardEntry.findMany({
    where: {
      ...(showAll ? {} : { awardId: awardId as number }),
      ...(year !== undefined ? { year } : {}),
    },
    orderBy: [{ year: "desc" }, { type: "asc" }],
    select: {
      id: true,
      year: true,
      type: true,
      award: showAll ? { select: { name: true } } : false,
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
          readingStatuses: {
            where: { userId: TEMP_USER_ID },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });

  const reviewedBookIds = new Set(
    (await prisma.review.findMany({
      where: { userId: TEMP_USER_ID },
      select: { bookId: true },
    })).map((r) => r.bookId)
  );

  const entries: BookWithAwardEntry[] = awardEntries.map((entry) => ({
    awardEntryId: entry.id,
    year: entry.year,
    type: entry.type,
    awardName: showAll && "award" in entry && entry.award ? (entry.award as { name: string }).name : undefined,
    status: (entry.book.readingStatuses[0]?.status ?? "unread") as ReadingStatus,
    hasReview: reviewedBookIds.has(entry.book.id),
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {entries.map((entry) => (
        <BookCard key={entry.awardEntryId} entry={entry} />
      ))}
    </div>
  );
}
