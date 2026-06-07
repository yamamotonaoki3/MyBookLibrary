import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const [statuses, reviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: {
        userId: TEMP_USER_ID,
        status: { in: ["reading", "read"] },
        ...(q ? { book: { title: { contains: q } } } : {}),
      },
      include: { book: { include: { author: { select: { name: true } } } } },
    }),
    prisma.review.findMany({
      where: { userId: TEMP_USER_ID },
      select: { bookId: true },
    }),
  ]);

  const reviewedBookIds = new Set(reviews.map((r) => r.bookId));

  return Response.json(
    statuses.map((rs) => ({
      ...rs.book,
      hasReview: reviewedBookIds.has(rs.book.id),
    }))
  );
}
