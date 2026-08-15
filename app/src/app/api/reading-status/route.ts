import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { ReadingStatusSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { logger } from "@/lib/logger";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";

async function notifyMutualFollowersOfWantToRead(
  userId: number,
  book: { title: string }
) {
  try {
    const mutualFollowerIds = await getMutualFollowerIds(userId);
    if (mutualFollowerIds.length === 0) return;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!me) return;

    // bookIsbn は Notification の一意制約 (userId, type, bookIsbn) の対象のため、
    // ここで設定すると別の相互フォロー相手が同じ本を追加した際に通知が上書き・消失してしまう。
    // 本種別は bookTitle のみ保持し、bookIsbn は設定しない（本詳細への直接リンクは行わない）。
    await prisma.notification.createMany({
      data: mutualFollowerIds.map((partnerId) => ({
        userId: partnerId,
        type: "mutual_want_to_read",
        content: `${me.name}さんが「${book.title}」を読みたい本に追加しました。`,
        actorId: userId,
        bookTitle: book.title,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[POST /api/reading-status] failed to notify mutual followers"
    );
  }
}


export async function POST(request: Request) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const body = await request.json();
    const parsed = ReadingStatusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { isbn, title, author, coverImageUrl, status, publishedAt, source } = parsed.data;

    // 著者名を正規化してからDB検索・保存（スペース違いによる分裂防止）
    const normalizedAuthor = normalizeAuthorName(author);
    let authorRecord = await prisma.author.findFirst({
      where: { name: normalizedAuthor },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
    }

    // 1. ISBNで検索
    // 2. 見つからなければタイトル+著者で検索（版違いの重複登録を防ぐ）
    // 3. それでも見つからなければ新規作成
    let book = isbn
      ? await prisma.book.findFirst({ where: { isbn } })
      : null;

    if (!book) {
      book = await prisma.book.findFirst({
        where: { title, authorId: authorRecord.id },
      });
    }

    if (!book) {
      book = await prisma.book.create({
        data: {
          title,
          authorId: authorRecord.id,
          isbn: isbn || null,
          coverImageUrl: coverImageUrl ?? null,
          publishedAt: publishedAt ? (parseSalesDateToUtcDate(publishedAt) ?? new Date()) : new Date(),
          source: source ?? "rakuten",
          createdByUserId: userId,
        },
      });
    }

    // 未読はデフォルト状態（レコードなし）なので削除、それ以外はupsert
    if (status === "unread") {
      await prisma.readingStatus.deleteMany({
        where: { userId: userId, bookId: book.id },
      });
      return Response.json({ status: "unread", bookId: book.id });
    }

    const existingStatus = await prisma.readingStatus.findUnique({
      where: { userId_bookId: { userId: userId, bookId: book.id } },
      select: { status: true },
    });

    const readingStatus = await prisma.readingStatus.upsert({
      where: { userId_bookId: { userId: userId, bookId: book.id } },
      update: { status },
      create: { userId: userId, bookId: book.id, status },
    });

    // 同時リクエストが重なった場合に稀に通知が重複しうるが、行ロックによる
    // 直列化はInnoDBのギャップロック同士でデッドロックを招くリスクがあるため採用しない
    // （保存自体が失敗する方が、通知が稀に重複するより悪い）。
    if (
      status === "want_to_read" &&
      (!existingStatus || existingStatus.status !== "want_to_read")
    ) {
      await notifyMutualFollowersOfWantToRead(userId, { title: book.title });
    }

    return Response.json(readingStatus);
  } catch (error) {
    logger.error({ err: error }, "[POST /api/reading-status]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
