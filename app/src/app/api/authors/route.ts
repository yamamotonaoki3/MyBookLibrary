import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";


export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const [authors, favoriteAuthors] = await Promise.all([
      prisma.author.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { books: true } },
        },
      }),
      prisma.favoriteAuthor.findMany({
        where: { userId: userId },
        select: { authorId: true },
      }),
    ]);

    const favoriteAuthorIds = new Set(favoriteAuthors.map((f) => f.authorId));

    const result = authors.map((author) => ({
      id: author.id,
      name: author.name,
      bookCount: author._count.books,
      isFavorite: favoriteAuthorIds.has(author.id),
    }));

    return Response.json(result);
  } catch (error) {
    logger.error({ err: error }, "[GET /api/authors]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
