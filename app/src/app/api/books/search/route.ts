import { NextRequest, NextResponse } from "next/server";
import { fetchBookPage, deduplicateByTitle } from "@/lib/rakuten";
import { searchBooksNdl } from "@/lib/ndl";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";

const HITS_PER_PAGE = 30;

export type SearchResult = {
  id?: number;
  title: string;
  author: string;
  isbn: string | null;
  publisherName: string;
  salesDate: string;
  size: string;
  coverImageUrl: string | null;
  awards: { name: string; year: number; type: string }[];
  status: string;
  source?: "manual" | "rakuten";
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
  const deduplicate = searchParams.get("deduplicate") !== "false";

  if (!q) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }
  if (type !== "title" && type !== "author" && type !== "keyword") {
    return NextResponse.json(
      { error: "type は title / author / keyword を指定してください" },
      { status: 400 }
    );
  }

  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    let params: { title?: string; author?: string };
    if (type === "keyword") {
      const parts = q.split(/\s+/);
      const authorPart = parts.slice(1).join(" ") || undefined;
      params = { title: parts[0], author: authorPart };
    } else {
      params = type === "title" ? { title: q } : { author: q };
    }
    const { items: rawItems, pageCount } = await fetchBookPage({
      ...params,
      page,
      hits: HITS_PER_PAGE,
    });

    // 管理者画面など deduplicate=false の場合は全版を返す
    const deduplicated = deduplicate ? deduplicateByTitle(rawItems) : rawItems;

    const isbns = deduplicated.map((b) => b.isbn).filter(Boolean);
    const titles = deduplicated.map((b) => b.title);
    const dbBooks = await prisma.book.findMany({
      where: { OR: [{ isbn: { in: isbns } }, { title: { in: titles } }] },
      select: {
        isbn: true,
        title: true,
        awardEntries: {
          select: { year: true, type: true, award: { select: { name: true } } },
        },
        readingStatuses: {
          where: { userId: userId },
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

    const rakutenItems: SearchResult[] = deduplicated.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn || null,
      publisherName: b.publisherName,
      salesDate: b.salesDate,
      size: b.size ?? "",
      coverImageUrl: b.largeImageUrl || null,
      awards: awardsByIsbn.get(b.isbn) ?? awardsByTitle.get(b.title) ?? [],
      status: statusByIsbn.get(b.isbn) ?? statusByTitle.get(b.title) ?? "unread",
    }));

    // 楽天が0件 → NDLにフォールバック
    if (rakutenItems.length === 0) {
      const ndlResult = await searchBooksNdl({ type: type as "title" | "author" | "keyword", q, page });
      if (ndlResult.items.length > 0) {
        const ndlIsbns = ndlResult.items.map((b) => b.isbn).filter((v): v is string => v !== null);
        const ndlTitles = ndlResult.items.map((b) => b.title);
        const ndlDbBooks = await prisma.book.findMany({
          where: { OR: [{ isbn: { in: ndlIsbns } }, { title: { in: ndlTitles } }] },
          select: {
            isbn: true,
            title: true,
            awardEntries: { select: { year: true, type: true, award: { select: { name: true } } } },
            readingStatuses: { where: { userId }, select: { status: true } },
          },
        });
        const ndlAwardsByIsbn = new Map(ndlDbBooks.filter((b) => b.isbn).map((b) => [b.isbn, toAwards(b.awardEntries)]));
        const ndlAwardsByTitle = new Map(ndlDbBooks.map((b) => [b.title, toAwards(b.awardEntries)]));
        const ndlStatusByIsbn = new Map(ndlDbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b.readingStatuses[0]?.status ?? "unread"]));
        const ndlStatusByTitle = new Map(ndlDbBooks.map((b) => [b.title, b.readingStatuses[0]?.status ?? "unread"]));

        const ndlItems: SearchResult[] = ndlResult.items.map((b) => ({
          title: b.title,
          author: b.author,
          isbn: b.isbn,
          publisherName: b.publisherName,
          salesDate: b.salesDate,
          size: "",
          coverImageUrl: null,
          awards: (b.isbn ? ndlAwardsByIsbn.get(b.isbn) : undefined) ?? ndlAwardsByTitle.get(b.title) ?? [],
          status: (b.isbn ? ndlStatusByIsbn.get(b.isbn) : undefined) ?? ndlStatusByTitle.get(b.title) ?? "unread",
        }));

        return NextResponse.json({
          items: ndlItems,
          totalPages: ndlResult.totalPages,
          currentPage: page,
        } satisfies SearchResponse);
      }
    }

    // 1ページ目のみ手動登録本をDBから取得して先頭に追加
    let manualItems: SearchResult[] = [];
    if (page === 1) {
      const whereClause = type === "author"
        ? { author: { name: { contains: q } } }
        : { title: { contains: q } };
      const manualBooks = await prisma.book.findMany({
        where: { source: "manual", ...whereClause },
        include: {
          author: true,
          awardEntries: { select: { year: true, type: true, award: { select: { name: true } } } },
          readingStatuses: { where: { userId }, select: { status: true } },
        },
      });

      const rakutenTitles = new Set(rakutenItems.map((b) => b.title));
      const formatDate = (d: Date) =>
        `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;

      manualItems = manualBooks
        .filter((b) => !rakutenTitles.has(b.title))
        .map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author.name,
          isbn: b.isbn ?? null,
          publisherName: "",
          salesDate: formatDate(b.publishedAt),
          size: "",
          coverImageUrl: b.coverImageUrl,
          awards: b.awardEntries.map((e) => ({ name: e.award.name, year: e.year, type: e.type })),
          status: b.readingStatuses[0]?.status ?? "unread",
          source: "manual" as const,
        }));
    }

    const items = [...manualItems, ...rakutenItems];

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
