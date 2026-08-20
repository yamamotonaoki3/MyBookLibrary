import { NextRequest, NextResponse } from "next/server";
import {
  fetchBookPage,
  deduplicateByTitle,
  normalizeTitle,
  normalizeAuthor,
  isNonBookSize,
} from "@/lib/rakuten";
import { searchBooksNdl } from "@/lib/ndl";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { isRateLimited } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const HITS_PER_PAGE = 30;

// 無限スクロールによる連続リクエストから外部API（楽天/NDL）を守るための間隔
const SEARCH_RATE_LIMIT_INTERVAL_MS = 500;

// 楽天+DB登録済みの本を合わせた件数がこの件数未満の場合のみ、1ページ目でNDLへも軽く問い合わせて
// 結果をマージする。多くの検索（人気作家等）では発動させず、速度・NDL利用規約への配慮を維持する。
// 実際の使用感を見て調整可能な値として切り出している。
const NDL_SUPPLEMENT_THRESHOLD = 5;

// 楽天結果に無いDB登録済みの本を補完表示する際の上限件数。sourceによる絞り込みを外した
// ことで該当件数が多くなりうるため、ページを圧迫しない程度に上限を設ける。
const DB_MERGE_LIMIT = 20;

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

    if (isRateLimited(`books-search:${userId}`, SEARCH_RATE_LIMIT_INTERVAL_MS)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくお待ちください。" },
        { status: 429 }
      );
    }

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

    // 読書管理の対象外（ムック・CD等）を除外する
    const bookItems = rawItems.filter((b) => !isNonBookSize(b.size ?? ""));

    // 管理者画面など deduplicate=false の場合は全版を返す
    const deduplicated = deduplicate ? deduplicateByTitle(bookItems) : bookItems;

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

    // 1ページ目のみ、楽天検索結果に無いDB登録済みの本（手動登録本・NDL解決済みの本など）を先頭に追加する。
    // 楽天のカタログに存在しない本（絶版・近刊で未登録等）でも、一括補完等で既にDBへ
    // 登録済みであれば検索結果から漏れないようにするため、sourceによる絞り込みは行わない。
    // 下の「楽天0件時のNDLフォールバック」より前に計算し、フォールバック発生時にもこのDB分を
    // マージできるようにする。
    let dbOnlyItems: SearchResult[] = [];
    if (page === 1) {
      // keywordはタイトル・著者の両パートを持ちうるため、楽天検索で使った params
      // （既にkeyword分割済み）と同じ条件で絞り込む。author指定時はタイトルを問わない。
      const whereClause = type === "author"
        ? { author: { name: { contains: q } } }
        : params.author
          ? { title: { contains: params.title ?? q }, author: { name: { contains: params.author } } }
          : { title: { contains: params.title ?? q } };
      const dbBooksForMerge = await prisma.book.findMany({
        where: whereClause,
        // 絞り込みを緩めたことで該当件数が多くなりうるため、補完目的として妥当な件数に上限を設ける。
        // ページネーションはせず、超過分は対象外とする（このマージはあくまで楽天の抜け漏れを
        // 補う位置づけのため）。
        take: DB_MERGE_LIMIT,
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
      // 著者表記の揺れで重複表示にならないよう、タイトルが検索結果・DB登録本の
      // 両方で一意な場合はタイトルのみの一致でも重複とみなす（lookup 側と同じ基準）
      const rakutenTitleCounts = countTitles(rakutenItems.map((b) => b.title));
      const dbBookTitleCounts = countTitles(dbBooksForMerge.map((b) => b.title));
      const isDuplicateOfRakuten = (b: { title: string; isbn: string | null; author: { name: string } }) => {
        if (b.isbn !== null && rakutenIsbns.has(b.isbn)) return true;
        if (rakutenKeys.has(makeKey(b.title, b.author.name))) return true;
        const t = normalizeTitle(b.title);
        return rakutenTitleCounts.get(t) === 1 && dbBookTitleCounts.get(t) === 1;
      };
      const formatDate = (d: Date) =>
        `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;

      dbOnlyItems = dbBooksForMerge
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
          source: b.source === "manual" ? ("manual" as const) : undefined,
        }));
    }

    // NDLへの問い合わせは1リクエストにつき最大1回に抑える（下の全体0件フォールバックと
    // 件数不足時の補完は排他的にしか発生しないが、フォールバックが0件で終わった場合に
    // 補完側で同一クエリを重複して問い合わせないようフラグで管理する）。
    let ndlAlreadyQueried = false;

    // 楽天が0件 → NDLにフォールバック。
    // 非書籍の除外で空になっただけの場合、後続ページに書籍がありうる間はフォールバックせず、
    // 最終ページまで書籍がなければフォールバックする。
    if (rawItems.length === 0 || (rakutenItems.length === 0 && page >= pageCount)) {
      ndlAlreadyQueried = true;
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

        // DBマージ分（dbOnlyItems）もNDL結果と重複しなければ先頭に加える。
        // 楽天が0件でもDB登録済みの本（このNDLフォールバック自体が拾わなかったもの）を
        // 取りこぼさないようにするため。
        const ndlItemKeys = new Set(ndlItems.map((b) => makeKey(b.title, b.author)));
        const ndlItemIsbns = new Set(ndlItems.map((b) => b.isbn).filter((v): v is string => v !== null));
        // 著者表記の揺れで重複表示にならないよう、タイトルが双方で一意な場合は
        // タイトルのみの一致でも重複とみなす（他の重複判定と同じ基準）
        const ndlItemTitleCounts = countTitles(ndlItems.map((b) => b.title));
        const dbOnlyItemTitleCounts = countTitles(dbOnlyItems.map((b) => b.title));
        const dbOnlyNotInNdl = dbOnlyItems.filter((b) => {
          if (b.isbn !== null && ndlItemIsbns.has(b.isbn)) return false;
          if (ndlItemKeys.has(makeKey(b.title, b.author))) return false;
          const t = normalizeTitle(b.title);
          if (ndlItemTitleCounts.get(t) === 1 && dbOnlyItemTitleCounts.get(t) === 1) return false;
          return true;
        });

        return NextResponse.json({
          items: [...dbOnlyNotInNdl, ...ndlItems],
          totalPages: ndlResult.totalPages,
          currentPage: page,
        } satisfies SearchResponse);
      }
    }

    let items: SearchResult[] = [...dbOnlyItems, ...rakutenItems];

    // 楽天+DBマージ後の件数が少ない場合のみ、NDLへも軽く問い合わせて結果をマージする
    // （全体0件時の上記フォールバックとは別に、既存の結果は残したまま補う）。
    // 上記フォールバックで既にNDLへ問い合わせ済み（0件だった）場合は、同一クエリの
    // 重複問い合わせを避けるためスキップする。
    // 書影は取得しない（NDLは書影情報を持たないため、既存の全件フォールバックと同じ形式）。
    if (page === 1 && items.length < NDL_SUPPLEMENT_THRESHOLD && !ndlAlreadyQueried) {
      const ndlSupplement = await searchBooksNdl({ type: type as "title" | "author" | "keyword", q, page: 1 });
      if (ndlSupplement.items.length > 0) {
        const existingKeys = new Set(items.map((b) => makeKey(b.title, b.author)));
        const existingIsbns = new Set(items.map((b) => b.isbn).filter((v): v is string => v !== null));
        const existingTitleCounts = countTitles(items.map((b) => b.title));
        const ndlTitleCounts = countTitles(ndlSupplement.items.map((b) => b.title));
        const isDuplicateOfExisting = (b: { title: string; author: string; isbn: string | null }) => {
          if (b.isbn !== null && existingIsbns.has(b.isbn)) return true;
          if (existingKeys.has(makeKey(b.title, b.author))) return true;
          const t = normalizeTitle(b.title);
          return existingTitleCounts.get(t) === 1 && ndlTitleCounts.get(t) === 1;
        };

        const supplementItems: SearchResult[] = ndlSupplement.items
          .filter((b) => !isDuplicateOfExisting(b))
          .map((b) => ({
            title: b.title,
            author: b.author,
            isbn: b.isbn,
            publisherName: b.publisherName,
            salesDate: b.salesDate,
            size: "",
            coverImageUrl: null,
            awards: [],
            status: "unread",
          }));

        items = [...items, ...supplementItems];
      }
    }

    // 非書籍の除外でページが空になっても pageCount は維持する。
    // 後続ページに書籍が含まれる可能性があり、ページネーションを閉じると辿れなくなるため。
    const response: SearchResponse = {
      items,
      totalPages: pageCount,
      currentPage: page,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error({ err }, "[GET /api/books/search]");
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
