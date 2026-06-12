import { NextRequest, NextResponse } from "next/server";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { getAuthenticatedUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type OpenBdSummary = {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  pubdate: string;
  cover: string;
};

async function searchByOpenBd(isbn: string): Promise<OpenBdSummary | null> {
  const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data[0]) return null;
  return (data[0].summary as OpenBdSummary) ?? null;
}

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

  // 楽天にない場合はOpenBDで検索
  console.log("[ISBN検索] 楽天で見つからず、OpenBDにフォールバック:", isbn);
  const openBdBook = await searchByOpenBd(isbn);
  if (!openBdBook || !openBdBook.title) {
    return NextResponse.json({ error: "本が見つかりませんでした" }, { status: 404 });
  }

  const currentStatus = await getCurrentStatus(isbn, userId);
  return NextResponse.json({
    title: openBdBook.title,
    author: openBdBook.author.replace(/／/g, " "),
    isbn: openBdBook.isbn,
    publisherName: openBdBook.publisher,
    salesDate: openBdBook.pubdate,
    coverImageUrl: openBdBook.cover || null,
    currentStatus,
  });
}
