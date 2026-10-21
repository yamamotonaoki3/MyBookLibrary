import { NextRequest } from "next/server";
import { mockFetchJson, mockFetchSequence, restoreFetch } from "../../helpers/fetchMock";

jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asUser } from "../../helpers/sessionMock";

describe("GET /api/calil/check", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/calil/check/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CALIL_API_KEY = "test-api-key";
    asUser(1);
    prismaMock.userLibrary.findMany.mockResolvedValue([
      { systemid: "Tokyo_Setagaya", libkey: "", name: "世田谷区立図書館" },
    ]);
  });

  afterEach(() => {
    restoreFetch();
    jest.useRealTimers();
    delete process.env.CALIL_API_KEY;
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/calil/check?${query}`);

  it("正常系: 複数ISBNの結果をマージし図書館名を付与して返す", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: {
            status: "OK",
            reserveurl: "https://example.test/reserve",
            libkey: { 玉川台: "貸出可" },
          },
        },
      },
    });

    const res = await GET(makeRequest("isbn=9784000000001"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results[0]).toMatchObject({
      systemid: "Tokyo_Setagaya",
      libkey: "玉川台",
      loanStatus: "貸出可",
      libname: "世田谷区立図書館",
    });
  });

  it("continueが1から0になるポーリングを経て最終結果を返す", async () => {
    jest.useFakeTimers();
    mockFetchSequence([
      { json: { continue: 1, session: "session-xyz", books: {} } },
      {
        json: {
          continue: 0,
          books: {
            "9784000000001": {
              Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: { 玉川台: "貸出中" } },
            },
          },
        },
      },
    ]);

    const resPromise = GET(makeRequest("isbn=9784000000001"));
    await jest.advanceTimersByTimeAsync(3000);
    const res = await resPromise;
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results[0].loanStatus).toBe("貸出中");
  });

  it("カーリルAPIが500を返した場合は500を返す", async () => {
    mockFetchJson({}, { status: 500 });

    const res = await GET(makeRequest("isbn=9784000000001"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeDefined();
  });
});

describe("GET /api/calil/check-book", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/calil/check-book/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CALIL_API_KEY = "test-api-key";
    asUser(1);
    prismaMock.book.findUnique.mockResolvedValue({
      id: 1,
      isbn: "9784000000001",
      bookIsbns: [{ isbn: "9784000000001", isPrimary: true, createdAt: new Date("2026-01-01") }],
    });
    prismaMock.userLibrary.findMany.mockResolvedValue([
      { systemid: "Tokyo_Setagaya", libkey: "", name: "世田谷区立図書館" },
    ]);
  });

  afterEach(() => {
    restoreFetch();
    jest.useRealTimers();
    delete process.env.CALIL_API_KEY;
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/calil/check-book?${query}`);

  it("ISBNで見つかった本の全版を確認する", async () => {
    prismaMock.book.findFirst.mockResolvedValue({
      id: 1, isbn: "9784000000001",
      bookIsbns: [{ isbn: "9784000000001" }, { isbn: "9784101010014" }],
    });
    mockFetchJson({ continue: 0, books: {} });
    const res = await GET(makeRequest("isbn=9784101010014"));
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).results)).toEqual(["9784000000001", "9784101010014"]);
    expect(prismaMock.book.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ isbn: "9784101010014" }, { bookIsbns: { some: { isbn: "9784101010014" } } }] },
    }));
    expect(prismaMock.book.create).not.toHaveBeenCalled();
    expect(prismaMock.readingStatus.upsert).not.toHaveBeenCalled();
  });

  it("未登録ISBNは登録せず単一版として確認する", async () => {
    prismaMock.book.findFirst.mockResolvedValue(null);
    mockFetchJson({ continue: 0, books: {} });
    const res = await GET(makeRequest("isbn=9784101010014"));
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()).results)).toEqual(["9784101010014"]);
    expect(prismaMock.book.create).not.toHaveBeenCalled();
    expect(prismaMock.readingStatus.upsert).not.toHaveBeenCalled();
  });

  it.each(["", "bookId=-1", "bookId=1.5", "isbn=invalid", "bookId=abc&isbn=9784101010014"])("不正な確認対象を拒否する: %s", async (query) => {
    const res = await GET(makeRequest(query));
    expect(res.status).toBe(400);
  });

  it("存在しない本IDは404を返す", async () => {
    prismaMock.book.findUnique.mockResolvedValue(null);
    expect((await GET(makeRequest("bookId=999"))).status).toBe(404);
  });

  it("代表ISBNなしでも登録された版をすべて確認する", async () => {
    prismaMock.book.findUnique.mockResolvedValue({
      id: 1, isbn: null, bookIsbns: [{ isbn: "9784101010014" }, { isbn: "9784000000001" }],
    });
    mockFetchJson({ continue: 0, books: {} });
    const res = await GET(makeRequest("bookId=1"));
    expect(Object.keys((await res.json()).results)).toEqual(["9784101010014", "9784000000001"]);
  });

  it("ISBN-10でのみ見つかる蔵書も元の版にまとめて表示する", async () => {
    prismaMock.book.findUnique.mockResolvedValue({
      id: 1, isbn: "9784101010014", bookIsbns: [{ isbn: "9784101010014" }],
    });
    mockFetchJson({ continue: 0, books: {
      "9784101010014": { Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: {} } },
      "4101010013": { Tokyo_Setagaya: { status: "OK", reserveurl: "https://example.com/reserve", libkey: { 玉川台: "貸出可" } } },
    } });
    const res = await GET(makeRequest("bookId=1"));
    const json = await res.json();
    expect(Object.keys(json.results)).toEqual(["9784101010014"]);
    expect(json.results["9784101010014"]).toEqual([
      expect.objectContaining({ loanStatus: "貸出可", libkey: "玉川台" }),
    ]);
  });

  it("正常系: ISBNごとの在庫状況をマップで返す", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: {
            status: "OK",
            reserveurl: "",
            libkey: { 玉川台: "貸出可" },
          },
        },
      },
    });

    const res = await GET(makeRequest("bookId=1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.results["9784000000001"])).toBe(true);
    expect(json.results["9784000000001"][0]).toMatchObject({
      systemid: "Tokyo_Setagaya",
      libkey: "玉川台",
      loanStatus: "貸出可",
      libname: "世田谷区立図書館",
    });
  });

  it("カーリルAPIが500を返した場合は500を返す", async () => {
    mockFetchJson({}, { status: 500 });

    const res = await GET(makeRequest("bookId=1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeDefined();
  });
});
