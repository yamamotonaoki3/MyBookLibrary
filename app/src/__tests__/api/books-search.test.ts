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

import { prismaMock } from "../helpers/prismaMock";
import { asUser, getAuthenticatedUserIdMock, unauthorizedResponse } from "../helpers/sessionMock";

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
