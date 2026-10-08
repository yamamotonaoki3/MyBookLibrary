import "server-only";

import { prisma } from "@/lib/prisma";
import type { RecentRead } from "@/shared/dashboard";

type RecentReadRecord = {
  id: number;
  status: RecentRead["status"];
  bookId: number;
  book: {
    title: string;
    isbn: string | null;
    coverImageUrl: string | null;
    publishedAt: Date;
    author: { name: string };
  };
};

/**
 * Server-only dashboard query. Its result is deliberately serializable so a
 * route can pass it to the frontend without exposing Prisma records.
 */
export async function getRecentReads(userId: number): Promise<RecentRead[]> {
  const recentReads = await prisma.readingStatus.findMany({
    where: { userId, status: { in: ["reading", "read"] } },
    orderBy: { updatedAt: "desc" },
    include: { book: { include: { author: true } } },
  });

  return (recentReads as RecentReadRecord[]).map((readingStatus) => ({
    id: readingStatus.id,
    status: readingStatus.status,
    book: {
      id: readingStatus.bookId,
      title: readingStatus.book.title,
      authorName: readingStatus.book.author.name,
      isbn: readingStatus.book.isbn,
      coverImageUrl: readingStatus.book.coverImageUrl,
      publishedAt: readingStatus.book.publishedAt.toISOString(),
    },
  }));
}
