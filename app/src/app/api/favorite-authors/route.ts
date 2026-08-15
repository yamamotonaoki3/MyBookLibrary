import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { FavoriteAuthorSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { logger } from "@/lib/logger";

async function notifyMutualFollowersOfFavoriteAuthor(
  userId: number,
  authorName: string
) {
  try {
    const mutualFollowerIds = await getMutualFollowerIds(userId);
    if (mutualFollowerIds.length === 0) return;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!me) return;

    await prisma.notification.createMany({
      data: mutualFollowerIds.map((partnerId) => ({
        userId: partnerId,
        type: "mutual_favorite_author",
        content: `${me.name}さんがお気に入り著者に「${authorName}」を追加しました。`,
        actorId: userId,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[POST /api/favorite-authors] failed to notify mutual followers"
    );
  }
}


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
    logger.error({ err: error }, "[GET /api/favorite-authors]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const body = await request.json();

    // authorId が指定された場合はそれを優先する（おすすめ著者からの追加など、
    // 著者名だけでは Author.name が一意でないため別のレコードを指してしまう
    // 可能性がある経路向け）。指定がなければ従来どおり著者名で検索・作成する。
    let authorId: number;
    let authorName: string;
    if (typeof body.authorId === "number" && Number.isInteger(body.authorId)) {
      const author = await prisma.author.findUnique({ where: { id: body.authorId } });
      if (!author) {
        return Response.json({ error: "著者が見つかりません。" }, { status: 404 });
      }
      authorId = author.id;
      authorName = author.name;
    } else {
      const rawName = normalizeAuthorName(String(body.authorName ?? "").trim());

      const parsed = FavoriteAuthorSchema.safeParse({ authorName: rawName });
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0].message },
          { status: 400 }
        );
      }

      const parsedAuthorName = parsed.data.authorName;

      // 著者名でDBを検索し、なければ新規作成
      let author = await prisma.author.findFirst({ where: { name: parsedAuthorName } });
      if (!author) {
        author = await prisma.author.create({ data: { name: parsedAuthorName } });
      }
      authorId = author.id;
      authorName = author.name;
    }

    const favoriteAuthor = await prisma.favoriteAuthor.create({
      data: { userId: userId, authorId },
    });

    await notifyMutualFollowersOfFavoriteAuthor(userId, authorName);

    return Response.json(favoriteAuthor, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/favorite-authors]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
