import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";

const TEMP_USER_ID = 1;

export async function GET() {
  try {
    const favoriteAuthors = await prisma.favoriteAuthor.findMany({
      where: { userId: TEMP_USER_ID },
      select: {
        id: true,
        authorId: true,
        notify: true,
        author: {
          select: {
            name: true,
            _count: { select: { books: true } },
          },
        },
      },
      orderBy: { author: { name: "asc" } },
    });

    const result = favoriteAuthors.map((f) => ({
      id: f.id,
      authorId: f.authorId,
      authorName: f.author.name,
      bookCount: f.author._count.books,
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
    const body = await request.json();
    const authorName = normalizeAuthorName(String(body.authorName ?? "").trim());

    if (!authorName) {
      return Response.json({ error: "authorName is required" }, { status: 400 });
    }

    // 著者名でDBを検索し、なければ新規作成
    let author = await prisma.author.findFirst({ where: { name: authorName } });
    if (!author) {
      author = await prisma.author.create({ data: { name: authorName } });
    }

    const favoriteAuthor = await prisma.favoriteAuthor.create({
      data: { userId: TEMP_USER_ID, authorId: author.id },
    });

    return Response.json(favoriteAuthor, { status: 201 });
  } catch (error) {
    console.error("[POST /api/favorite-authors]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
