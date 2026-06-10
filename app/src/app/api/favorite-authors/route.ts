import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { FavoriteAuthorSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";


export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const favoriteAuthors = await prisma.favoriteAuthor.findMany({
      where: { userId: userId },
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
                  where: { userId: userId, status: "reading" },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
      orderBy: { author: { name: "asc" } },
    });

    const result = favoriteAuthors.map((f) => ({
      id: f.id,
      authorId: f.authorId,
      authorName: f.author.name,
      readingCount: f.author.books.reduce(
        (sum, book) => sum + book.readingStatuses.length,
        0
      ),
      notify: f.notify,
    }));

    return Response.json(result);
  } catch (error) {
    console.error("[GET /api/favorite-authors]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const body = await request.json();
    const rawName = normalizeAuthorName(String(body.authorName ?? "").trim());

    const parsed = FavoriteAuthorSchema.safeParse({ authorName: rawName });
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const authorName = parsed.data.authorName;

    // 著者名でDBを検索し、なければ新規作成
    let author = await prisma.author.findFirst({ where: { name: authorName } });
    if (!author) {
      author = await prisma.author.create({ data: { name: authorName } });
    }

    const favoriteAuthor = await prisma.favoriteAuthor.create({
      data: { userId: userId, authorId: author.id },
    });

    return Response.json(favoriteAuthor, { status: 201 });
  } catch (error) {
    console.error("[POST /api/favorite-authors]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
