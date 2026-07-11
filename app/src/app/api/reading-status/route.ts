import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { ReadingStatusSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";


function parseSalesDate(salesDate: string): Date {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return new Date();
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = match[3] ? parseInt(match[3]) : 1;
  return new Date(year, month, day);
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
          publishedAt: publishedAt ? parseSalesDate(publishedAt) : new Date(),
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

    const readingStatus = await prisma.readingStatus.upsert({
      where: { userId_bookId: { userId: userId, bookId: book.id } },
      update: { status },
      create: { userId: userId, bookId: book.id, status },
    });

    return Response.json(readingStatus);
  } catch (error) {
    console.error("[POST /api/reading-status]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
