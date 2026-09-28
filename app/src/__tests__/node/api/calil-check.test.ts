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
