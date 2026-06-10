import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";


export async function GET(request: Request) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const [statuses, reviews] = await Promise.all([
    prisma.readingStatus.findMany({
      where: {
        userId: userId,
        status: { in: ["reading", "read"] },
        ...(q ? { book: { title: { contains: q } } } : {}),
      },
      include: { book: { include: { author: { select: { name: true } } } } },
    }),
    prisma.review.findMany({
      where: { userId: userId },
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
