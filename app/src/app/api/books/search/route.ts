import { NextRequest, NextResponse } from "next/server";
import { fetchBookPage } from "@/lib/rakuten";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;
const HITS_PER_PAGE = 30;

export type SearchResult = {
  title: string;
  author: string;
  isbn: string;
  publisherName: string;
  salesDate: string;
  coverImageUrl: string | null;
  awards: { name: string; year: number; type: string }[];
  status: string;
};

export type SearchResponse = {
  items: SearchResult[];
  totalPages: number;
  currentPage: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  if (!q) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }
  if (type !== "title" && type !== "author") {
    return NextResponse.json(
      { error: "type は title または author を指定してください" },
      { status: 400 }
    );
  }

  try {
    const params = type === "title" ? { title: q } : { author: q };
    const { items: rawItems, pageCount } = await fetchBookPage({
      ...params,
      page,
      hits: HITS_PER_PAGE,
    });

    const isbns = rawItems.map((b) => b.isbn).filter(Boolean);
    const titles = rawItems.map((b) => b.title);
    const dbBooks = await prisma.book.findMany({
      where: { OR: [{ isbn: { in: isbns } }, { title: { in: titles } }] },
      select: {
        isbn: true,
        title: true,
        awardEntries: {
          select: { year: true, type: true, award: { select: { name: true } } },
        },
        readingStatuses: {
          where: { userId: TEMP_USER_ID },
          select: { status: true },
        },
      },
    });

    const toAwards = (entries: { year: number; type: string; award: { name: string } }[]) =>
      entries.map((e) => ({ name: e.award.name, year: e.year, type: e.type }));

    const awardsByIsbn = new Map(dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, toAwards(b.awardEntries)]));
    const awardsByTitle = new Map(dbBooks.map((b) => [b.title, toAwards(b.awardEntries)]));
    const statusByIsbn = new Map(
      dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b.readingStatuses[0]?.status ?? "unread"])
    );
    const statusByTitle = new Map(
      dbBooks.map((b) => [b.title, b.readingStatuses[0]?.status ?? "unread"])
    );

    const items: SearchResult[] = rawItems.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      publisherName: b.publisherName,
      salesDate: b.salesDate,
      coverImageUrl: b.largeImageUrl || null,
      awards: awardsByIsbn.get(b.isbn) ?? awardsByTitle.get(b.title) ?? [],
      status: statusByIsbn.get(b.isbn) ?? statusByTitle.get(b.title) ?? "unread",
    }));

    const response: SearchResponse = {
      items,
      totalPages: pageCount,
      currentPage: page,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
