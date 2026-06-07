import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";

const TEMP_USER_ID = 1;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { isbn, title, author, coverImageUrl, status } = body;

    if (!title || !author || !status) {
      return Response.json(
        { error: "title, author, status are required" },
        { status: 400 }
      );
    }

    // 著者名を正規化してからDB検索・保存（スペース違いによる分裂防止）
    const normalizedAuthor = normalizeAuthorName(author);
    let authorRecord = await prisma.author.findFirst({
      where: { name: normalizedAuthor },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
    }

    // ISBNあり → ISBNで検索、なければ作成
    // ISBNなし → タイトル+著者IDで検索、なければ作成
    let book = isbn
      ? await prisma.book.findFirst({ where: { isbn } })
      : await prisma.book.findFirst({
          where: { title, authorId: authorRecord.id },
        });

    if (!book) {
      book = await prisma.book.create({
        data: {
          title,
          authorId: authorRecord.id,
          isbn: isbn || null,
          coverImageUrl: coverImageUrl ?? null,
          publishedAt: new Date(),
        },
      });
    }

    // 未読はデフォルト状態（レコードなし）なので削除、それ以外はupsert
    if (status === "unread") {
      await prisma.readingStatus.deleteMany({
        where: { userId: TEMP_USER_ID, bookId: book.id },
      });
      return Response.json({ status: "unread" });
    }

    const readingStatus = await prisma.readingStatus.upsert({
      where: { userId_bookId: { userId: TEMP_USER_ID, bookId: book.id } },
      update: { status },
      create: { userId: TEMP_USER_ID, bookId: book.id, status },
    });

    return Response.json(readingStatus);
  } catch (error) {
    console.error("[POST /api/reading-status]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
