jest.mock("@/lib/searchTimeouts", () => ({
  SEARCH_RAKUTEN_TIMEOUT_MS: 20, SEARCH_RAKUTEN_TOTAL_TIMEOUT_MS: 40,
  SEARCH_NDL_TIMEOUT_MS: 20, SEARCH_BUDGET_MS: 60,
}));
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

const mockFetchBookPage = jest.fn();
const mockDeduplicateByTitle = jest.fn((items: unknown[]) => items);
const mockSearchBooksNdl = jest.fn();

// 外部APIクライアントは実リクエストを飛ばさないようモジュール単位で差し替える。
// 純粋関数（normalizeTitle 等）は実装と同じ挙動を保つため、ここで再現しておく。
jest.mock("@/lib/rakuten", () => ({
  fetchBookPage: (...args: unknown[]) => mockFetchBookPage(...args),
  deduplicateByTitle: (items: unknown[]) => mockDeduplicateByTitle(items),
  normalizeTitle: (title: string) => title.trim().replace(/\s+/g, "").normalize("NFKC"),
  normalizeAuthor: (author: string) => author.trim().replace(/\s+/g, "").normalize("NFKC"),
  isNonBookSize: (size: string) => /ムック|カセット|CD|DVD|Blu-ray|ブルーレイ|カレンダー/i.test(size),
}));

jest.mock("@/lib/ndl", () => ({
  searchBooksNdl: (...args: unknown[]) => mockSearchBooksNdl(...args),
}));

jest.mock("@/lib/prisma");
jest.mock("@/lib/session");
jest.mock("@/lib/bookReviewSummary", () => ({
  withPublicReviewCounts: jest.fn(async (items: Record<string, unknown>[]) =>
    items.map(item => ({ ...item, publicReviewCount: 7 }))),
}));

import { prismaMock } from "../../helpers/prismaMock";
import { asUser, getAuthenticatedUserIdMock, unauthorizedResponse } from "../../helpers/sessionMock";

describe("GET /api/books/search", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/books/search/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimits();
    mockDeduplicateByTitle.mockImplementation((items: unknown[]) => items);
    asUser(1);
    prismaMock.book.findMany.mockResolvedValue([]);
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/books/search?${query}`);

  it.each(["rakuten", "ndl", "supplement", "budget"])("%s timeout returns 504", async (source) => {
    const { fetchBookPage } = jest.requireActual("@/lib/rakuten");
    const { searchBooksNdl } = jest.requireActual("@/lib/ndl");
    process.env.RAKUTEN_APP_ID = "test-app-id";
    process.env.RAKUTEN_ACCESS_KEY = "test-access-key";
    const original = globalThis.fetch;
    globalThis.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(new DOMException("aborted", "AbortError"));
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    mockFetchBookPage.mockImplementation(source === "ndl" || source === "supplement"
      ? async () => ({ items: source === "supplement" ? [{ title: "test", author: "test author", isbn: "9780000000000", size: "", salesDate: "", publisherName: "", largeImageUrl: "" }] : [], pageCount: 1 })
      : source === "budget"
        ? (params, options) => fetchBookPage(params, { ...options, timeoutMs: 1000, totalTimeoutMs: 1000 })
        : fetchBookPage);
    mockSearchBooksNdl.mockImplementation(searchBooksNdl);
    try {
      const response = await GET(makeRequest("q=test&type=title"));
      expect(response.status).toBe(504);
      expect(await response.json()).toMatchObject({ code: "SEARCH_TIMEOUT" });
    } finally {
      globalThis.fetch = original;
      delete process.env.RAKUTEN_APP_ID;
      delete process.env.RAKUTEN_ACCESS_KEY;
      mockFetchBookPage.mockReset();
      mockSearchBooksNdl.mockReset();
    }
  });

  it.each([[undefined, 429], ["0", 200]])("検索間隔 %s: 同じ時刻の連続検索は %s", async (interval, expected) => {
    const previous = process.env.SEARCH_RATE_LIMIT_INTERVAL_MS;
    if (interval === undefined) delete process.env.SEARCH_RATE_LIMIT_INTERVAL_MS;
    else process.env.SEARCH_RATE_LIMIT_INTERVAL_MS = interval;
    const clock = jest.spyOn(Date, "now").mockReturnValue(10000);
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });
    try {
      expect((await GET(makeRequest("q=test&type=title"))).status).toBe(200);
      expect((await GET(makeRequest("q=test&type=title"))).status).toBe(expected);
      if (interval === undefined) {
        clock.mockReturnValue(10499);
        expect((await GET(makeRequest("q=test&type=title"))).status).toBe(429);
        clock.mockReturnValue(10500);
        expect((await GET(makeRequest("q=test&type=title"))).status).toBe(200);
      }
    } finally {
      clock.mockRestore();
      if (previous === undefined) delete process.env.SEARCH_RATE_LIMIT_INTERVAL_MS;
      else process.env.SEARCH_RATE_LIMIT_INTERVAL_MS = previous;
    }
  });

  it("キーワード未指定 → 400を返す", async () => {
    const res = await GET(makeRequest("type=title"));
    expect(res.status).toBe(400);
  });

  it("type が不正な値 → 400を返す", async () => {
    const res = await GET(makeRequest("q=test&type=invalid"));
    expect(res.status).toBe(400);
  });

  it("未認証 → getAuthenticatedUserIdのエラーをそのまま返す", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue({
      userId: null,
      error: unauthorizedResponse(),
    });

    const res = await GET(makeRequest("q=test&type=title"));
    expect(res.status).toBe(401);
  });

  it("正常系: 楽天APIがヒット → 楽天の結果を返す", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: [
        {
          title: "テスト本",
          author: "テスト著者",
          isbn: "1111111111111",
          publisherName: "テスト出版",
          salesDate: "2024年01月",
          size: "文庫",
          largeImageUrl: "http://example.com/cover.jpg",
        },
      ],
      pageCount: 1,
    });
    // 件数が閾値未満のためNDL補完が発動するが、追加候補が無ければ結果は楽天分のみ
    mockSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].title).toBe("テスト本");
  });

  it("DB登録済みの本（source: rakuten）が楽天結果に無ければ補完表示される", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `楽天本${i}`,
        author: "テスト著者",
        isbn: `100000000000${i}`,
        publisherName: "テスト出版",
        salesDate: "2024年01月",
        size: "文庫",
        largeImageUrl: "http://example.com/cover.jpg",
      })),
      pageCount: 1,
    });
    prismaMock.book.findMany.mockResolvedValue([
      {
        id: 99,
        title: "楽天に無い本",
        isbn: "9999999999999",
        coverImageUrl: null,
        publishedAt: new Date("2026-01-01"),
        source: "rakuten",
        author: { name: "テスト著者" },
        awardEntries: [],
        readingStatuses: [],
      },
    ]);

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(res.status).toBe(200);
    expect(json.items.some((i: { title: string }) => i.title === "楽天に無い本")).toBe(true);
  });

  it("楽天結果と同一ISBNのDB登録本は重複表示されない", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `楽天本${i}`,
        author: "テスト著者",
        isbn: `100000000000${i}`,
        publisherName: "テスト出版",
        salesDate: "2024年01月",
        size: "文庫",
        largeImageUrl: "http://example.com/cover.jpg",
      })),
      pageCount: 1,
    });
    prismaMock.book.findMany.mockResolvedValue([
      {
        id: 99,
        title: "楽天本0",
        isbn: "1000000000000",
        coverImageUrl: null,
        publishedAt: new Date("2026-01-01"),
        source: "rakuten",
        author: { name: "テスト著者" },
        awardEntries: [],
        readingStatuses: [],
      },
    ]);

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(json.items.filter((i: { isbn: string }) => i.isbn === "1000000000000")).toHaveLength(1);
  });

  it("楽天0件・NDLフォールバックが発動する場合でもDB登録済みの本がマージされる", async () => {
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({
      items: [
        {
          title: "NDL本",
          author: "NDL著者",
          isbn: "2222222222222",
          publisherName: "NDL出版",
          salesDate: "2023",
        },
      ],
      totalPages: 1,
    });
    // 1回目: 楽天結果に付与する受賞/ステータス検索（rawItemsが空でも常に実行される）
    // 2回目: DBマージ用クエリ（NDLフォールバックより前に実行される）
    // 3回目: NDLフォールバック内のDB受賞/ステータス検索
    prismaMock.book.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 99,
          title: "DBだけにある本",
          isbn: "3333333333333",
          coverImageUrl: null,
          publishedAt: new Date("2026-01-01"),
          source: "rakuten",
          author: { name: "テスト著者" },
          awardEntries: [],
          readingStatuses: [],
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(res.status).toBe(200);
    expect(json.items.some((i: { title: string }) => i.title === "NDL本")).toBe(true);
    expect(json.items.some((i: { title: string }) => i.title === "DBだけにある本")).toBe(true);
  });

  it("type=keywordでもDBマージがタイトル+著者の両方で絞り込む", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `楽天本${i}`,
        author: "テスト著者",
        isbn: `100000000000${i}`,
        publisherName: "テスト出版",
        salesDate: "2024年01月",
        size: "文庫",
        largeImageUrl: "http://example.com/cover.jpg",
      })),
      pageCount: 1,
    });
    prismaMock.book.findMany.mockResolvedValue([]);

    await GET(makeRequest("q=作品名%20著者名&type=keyword"));

    // 2回目の呼び出しがDBマージ用クエリ。title/authorの両方が渡っていることを確認する
    const mergeCallArgs = prismaMock.book.findMany.mock.calls[1][0];
    expect(mergeCallArgs.where).toEqual({
      title: { contains: "作品名" },
      author: { name: { contains: "著者名" } },
    });
  });

  it("楽天0件・NDLフォールバックも0件の場合、NDLへの重複問い合わせをしない", async () => {
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });
    prismaMock.book.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest("q=テスト&type=title"));
    await res.json();

    expect(mockSearchBooksNdl).toHaveBeenCalledTimes(1);
  });

  it("楽天+DBマージ後の件数が閾値未満 → NDLへ補完問い合わせしマージする", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: [
        {
          title: "楽天本",
          author: "テスト著者",
          isbn: "1000000000000",
          publisherName: "テスト出版",
          salesDate: "2024年01月",
          size: "文庫",
          largeImageUrl: "http://example.com/cover.jpg",
        },
      ],
      pageCount: 1,
    });
    mockSearchBooksNdl.mockResolvedValue({
      items: [
        {
          title: "NDL補完本",
          author: "テスト著者",
          isbn: "2000000000000",
          publisherName: "NDL出版",
          salesDate: "2026年05月",
        },
      ],
      totalPages: 1,
    });

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(mockSearchBooksNdl).toHaveBeenCalled();
    expect(json.items.some((i: { title: string }) => i.title === "NDL補完本")).toBe(true);
    // 補完分は書影を取得しない
    expect(json.items.find((i: { title: string }) => i.title === "NDL補完本").coverImageUrl).toBeNull();
  });

  it("楽天+DBマージ後の件数が閾値以上 → NDLへ問い合わせない", async () => {
    mockFetchBookPage.mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => ({
        title: `楽天本${i}`,
        author: "テスト著者",
        isbn: `100000000000${i}`,
        publisherName: "テスト出版",
        salesDate: "2024年01月",
        size: "文庫",
        largeImageUrl: "http://example.com/cover.jpg",
      })),
      pageCount: 1,
    });

    await GET(makeRequest("q=テスト&type=title"));

    expect(mockSearchBooksNdl).not.toHaveBeenCalled();
  });

  it("楽天が0件 → NDLにフォールバックする", async () => {
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({
      items: [
        {
          title: "NDL本",
          author: "NDL著者",
          isbn: "2222222222222",
          publisherName: "NDL出版",
          salesDate: "2023",
        },
      ],
      totalPages: 1,
    });

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(res.status).toBe(200);
    expect(mockSearchBooksNdl).toHaveBeenCalled();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].title).toBe("NDL本");
  });

  it("楽天・NDLともに0件 → 空配列を返す（手動登録本もなし）", async () => {
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();
    for (const item of json.items ?? []) expect(item.publicReviewCount).toBe(7);

    expect(res.status).toBe(200);
    expect(json.items).toEqual([]);
  });

  it("外部API呼び出しで例外発生 → 500を返す", async () => {
    mockFetchBookPage.mockRejectedValue(new Error("network error"));

    const res = await GET(makeRequest("q=テスト&type=title"));
    expect(res.status).toBe(500);
  });

  it("deduplicate=false → deduplicateByTitleを呼ばない", async () => {
    mockFetchBookPage.mockResolvedValue({ items: [], pageCount: 0 });
    mockSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });

    await GET(makeRequest("q=テスト&type=title&deduplicate=false"));
    expect(mockDeduplicateByTitle).not.toHaveBeenCalled();
  });
});
