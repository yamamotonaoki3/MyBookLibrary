import { NextRequest, NextResponse } from "next/server";
import {
  fetchBookPage,
  deduplicateByTitle,
  normalizeTitle,
  normalizeAuthor,
} from "@/lib/rakuten";
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

    // 同名タイトルの別作品を区別するため、タイトル照合は「タイトル｜著者」キーで行う。
    // ただし著者表記が外部APIとDBで揺れることがあるため、
    // タイトルがDB内・検索結果内の両方で一意な場合に限りタイトルのみのフォールバック照合を許可する。
    const makeKey = (title: string, author: string) =>
      `${normalizeTitle(title)}|${normalizeAuthor(author)}`;

    const countTitles = (titleList: string[]) => {
      const counts = new Map<string, number>();
      for (const t of titleList) {
        const key = normalizeTitle(t);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    const buildLookup = <T,>(
      books: { title: string; author: { name: string } }[],
      toValue: (index: number) => T,
      resultTitleCounts: Map<string, number>
    ) => {
      const byKey = new Map<string, T>();
      const dbTitleCounts = countTitles(books.map((b) => b.title));
      const byTitle = new Map<string, T>();
      books.forEach((b, i) => {
        byKey.set(makeKey(b.title, b.author.name), toValue(i));
        const t = normalizeTitle(b.title);
        if (dbTitleCounts.get(t) === 1 && (resultTitleCounts.get(t) ?? 0) <= 1) {
          byTitle.set(t, toValue(i));
        }
      });
      return (title: string, author: string): T | undefined =>
        byKey.get(makeKey(title, author)) ?? byTitle.get(normalizeTitle(title));
    };

    const isbns = deduplicated.map((b) => b.isbn).filter(Boolean);
    const titles = deduplicated.map((b) => b.title);
    const dbBooks = await prisma.book.findMany({
      where: { OR: [{ isbn: { in: isbns } }, { title: { in: titles } }] },
      select: {
        isbn: true,
        title: true,
        author: { select: { name: true } },
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

    const resultTitleCounts = countTitles(deduplicated.map((b) => b.title));
    const awardsByIsbn = new Map(dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, toAwards(b.awardEntries)]));
    const lookupAwards = buildLookup(
      dbBooks,
      (i) => toAwards(dbBooks[i].awardEntries),
      resultTitleCounts
    );
    const statusByIsbn = new Map(
      dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b.readingStatuses[0]?.status ?? "unread"])
    );
    const lookupStatus = buildLookup(
      dbBooks,
      (i) => dbBooks[i].readingStatuses[0]?.status ?? "unread",
      resultTitleCounts
    );

    const rakutenItems: SearchResult[] = deduplicated.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn || null,
      publisherName: b.publisherName,
      salesDate: b.salesDate,
      size: b.size ?? "",
      coverImageUrl: b.largeImageUrl || null,
      awards: awardsByIsbn.get(b.isbn) ?? lookupAwards(b.title, b.author) ?? [],
      status: statusByIsbn.get(b.isbn) ?? lookupStatus(b.title, b.author) ?? "unread",
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
            author: { select: { name: true } },
            awardEntries: { select: { year: true, type: true, award: { select: { name: true } } } },
            readingStatuses: { where: { userId }, select: { status: true } },
          },
        });
        const ndlResultTitleCounts = countTitles(ndlResult.items.map((b) => b.title));
        const ndlAwardsByIsbn = new Map(ndlDbBooks.filter((b) => b.isbn).map((b) => [b.isbn, toAwards(b.awardEntries)]));
        const ndlLookupAwards = buildLookup(
          ndlDbBooks,
          (i) => toAwards(ndlDbBooks[i].awardEntries),
          ndlResultTitleCounts
        );
        const ndlStatusByIsbn = new Map(ndlDbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b.readingStatuses[0]?.status ?? "unread"]));
        const ndlLookupStatus = buildLookup(
          ndlDbBooks,
          (i) => ndlDbBooks[i].readingStatuses[0]?.status ?? "unread",
          ndlResultTitleCounts
        );

        const ndlItems: SearchResult[] = ndlResult.items.map((b) => ({
          title: b.title,
          author: b.author,
          isbn: b.isbn,
          publisherName: b.publisherName,
          salesDate: b.salesDate,
          size: "",
          coverImageUrl: null,
          awards: (b.isbn ? ndlAwardsByIsbn.get(b.isbn) : undefined) ?? ndlLookupAwards(b.title, b.author) ?? [],
          status: (b.isbn ? ndlStatusByIsbn.get(b.isbn) : undefined) ?? ndlLookupStatus(b.title, b.author) ?? "unread",
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

      const rakutenKeys = new Set(rakutenItems.map((b) => makeKey(b.title, b.author)));
      const rakutenIsbns = new Set(
        rakutenItems.map((b) => b.isbn).filter((v): v is string => v !== null)
      );
      // 著者表記の揺れで重複表示にならないよう、タイトルが検索結果・手動登録の
      // 両方で一意な場合はタイトルのみの一致でも重複とみなす（lookup 側と同じ基準）
      const rakutenTitleCounts = countTitles(rakutenItems.map((b) => b.title));
      const manualTitleCounts = countTitles(manualBooks.map((b) => b.title));
      const isDuplicateOfRakuten = (b: { title: string; isbn: string | null; author: { name: string } }) => {
        if (b.isbn !== null && rakutenIsbns.has(b.isbn)) return true;
        if (rakutenKeys.has(makeKey(b.title, b.author.name))) return true;
        const t = normalizeTitle(b.title);
        return rakutenTitleCounts.get(t) === 1 && manualTitleCounts.get(t) === 1;
      };
      const formatDate = (d: Date) =>
        `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;

      manualItems = manualBooks
        .filter((b) => !isDuplicateOfRakuten(b))
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
