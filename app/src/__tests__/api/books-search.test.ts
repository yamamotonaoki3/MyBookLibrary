import { NextRequest } from "next/server";

const mockFetchBookPage = jest.fn();
const mockDeduplicateByTitle = jest.fn((items: unknown[]) => items);
const mockSearchBooksNdl = jest.fn();
const mockFindMany = jest.fn();
const mockGetAuthenticatedUserId = jest.fn();

jest.mock("@/lib/rakuten", () => ({
  fetchBookPage: (...args: unknown[]) => mockFetchBookPage(...args),
  deduplicateByTitle: (items: unknown[]) => mockDeduplicateByTitle(items),
}));

jest.mock("@/lib/ndl", () => ({
  searchBooksNdl: (...args: unknown[]) => mockSearchBooksNdl(...args),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    book: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

jest.mock("@/lib/session", () => ({
  getAuthenticatedUserId: () => mockGetAuthenticatedUserId(),
}));

describe("GET /api/books/search", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/books/search/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeduplicateByTitle.mockImplementation((items: unknown[]) => items);
    mockGetAuthenticatedUserId.mockResolvedValue({ userId: 1, error: null });
    mockFindMany.mockResolvedValue([]);
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/books/search?${query}`);

  it("キーワード未指定 → 400を返す", async () => {
    const res = await GET(makeRequest("type=title"));
    expect(res.status).toBe(400);
  });

  it("type が不正な値 → 400を返す", async () => {
    const res = await GET(makeRequest("q=test&type=invalid"));
    expect(res.status).toBe(400);
  });

  it("未認証 → getAuthenticatedUserIdのエラーをそのまま返す", async () => {
    mockGetAuthenticatedUserId.mockResolvedValue({
      userId: null,
      error: new Response(JSON.stringify({ error: "認証が必要です" }), { status: 401 }),
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

    const res = await GET(makeRequest("q=テスト&type=title"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].title).toBe("テスト本");
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
