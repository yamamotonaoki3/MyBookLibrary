import { NextRequest, NextResponse } from "next/server";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { searchBookByIsbn as searchBookByIsbnNdl } from "@/lib/ndl";
import { getAuthenticatedUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

async function getCurrentStatus(isbn: string, userId: number): Promise<string> {
  const dbBook = await prisma.book.findUnique({
    where: { isbn },
    select: {
      readingStatuses: {
        where: { userId },
        select: { status: true },
      },
    },
  });
  return dbBook?.readingStatuses[0]?.status ?? "unread";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const isbn = searchParams.get("isbn")?.trim();

  if (!isbn) {
    return NextResponse.json({ error: "ISBNを指定してください" }, { status: 400 });
  }

  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  // 楽天APIで検索
  const rakutenBook = await searchBooksByIsbn(isbn);
  if (rakutenBook) {
    const currentStatus = await getCurrentStatus(isbn, userId);
    return NextResponse.json({
      title: rakutenBook.title,
      author: rakutenBook.author,
      isbn: rakutenBook.isbn,
      publisherName: rakutenBook.publisherName,
      salesDate: rakutenBook.salesDate,
      coverImageUrl: rakutenBook.largeImageUrl || null,
      currentStatus,
    });
  }

  // 楽天にない場合は国立国会図書館APIで検索
  logger.info({ isbn }, "[ISBN検索] 楽天で見つからず、国立国会図書館APIにフォールバック");
  const ndlBook = await searchBookByIsbnNdl(isbn);
  if (!ndlBook || !ndlBook.title) {
    return NextResponse.json({ error: "本が見つかりませんでした" }, { status: 404 });
  }

  const currentStatus = await getCurrentStatus(isbn, userId);
  return NextResponse.json({
    title: ndlBook.title,
    author: ndlBook.author,
    isbn,
    publisherName: ndlBook.publisher,
    salesDate: ndlBook.pubdate,
    coverImageUrl: null,
    currentStatus,
  });
}
