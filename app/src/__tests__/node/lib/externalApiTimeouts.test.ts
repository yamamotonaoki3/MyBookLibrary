import { resolvePreferringHardcover, USER_FACING_RESOLVE_OPTIONS } from "@/lib/editionResolver";
import { fetchBookPage, searchBooks, searchBooksByIsbn } from "@/lib/rakuten";
import { searchNdlHardcoverCandidates } from "@/lib/ndl";
import { restoreFetch } from "../../helpers/fetchMock";

// タイムアウト・並行実行・全体予算の検証（#634）。外部APIは実際には呼ばず、
// 中断シグナルを尊重する fetch のモックで「応答しない／遅い」状況を再現する。

type Handler = (init: RequestInit | undefined) => Promise<Response>;

function installFetch(routes: { ndl: Handler; rakuten: Handler }) {
  const calls = { ndl: [] as (RequestInit | undefined)[], rakuten: [] as (RequestInit | undefined)[] };
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const key = url.includes("ndlsearch") ? "ndl" : "rakuten";
    calls[key].push(init);
    return routes[key](init);
  }) as unknown as typeof fetch;
  return calls;
}

/** 中断されるまで応答しない（中断されたら AbortError で reject する）。 */
const hang: Handler = (init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

/** Headers arrive immediately, but the JSON body stalls until aborted. */
const hangBody: Handler = async (init) => new Response(
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"Items":['));
      const abort = () => controller.error(new DOMException("aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    },
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);

const sruXml = (records: string, n: number) =>
  `<?xml version="1.0"?><searchRetrieveResponse><numberOfRecords>${n}</numberOfRecords><records>${records}</records></searchRetrieveResponse>`;
const sruHardcover = `<record><recordData>
<dc:title>しき</dc:title><dc:creator>町屋良平</dc:creator>
<dc:identifier>ISBN 9784309027180</dc:identifier><dcterms:extent>172p ; 20cm</dcterms:extent>
</recordData></record>`;
const ok = (text: string): Handler => async () => new Response(text, { status: 200 });
const rakutenOk = (isbn: string, size: string): Handler => async () =>
  new Response(
    JSON.stringify({
      Items: [{ title: "しき", author: "町屋良平", largeImageUrl: "", publisherName: "出版社", salesDate: "2020年03月", isbn, size }],
      pageCount: 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

const target = {
  title: "しき",
  author: "町屋良平",
  fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
};

beforeEach(() => {
  process.env.RAKUTEN_APP_ID = "test-app-id";
  process.env.RAKUTEN_ACCESS_KEY = "test-access-key";
});

afterEach(() => {
  restoreFetch();
  delete process.env.RAKUTEN_APP_ID;
  delete process.env.RAKUTEN_ACCESS_KEY;
});

describe("NDL のタイムアウト", () => {
  it("応答しない場合、timeoutMs で打ち切って空配列を返す", async () => {
    installFetch({ ndl: hang, rakuten: hang });
    const started = Date.now();
    const result = await searchNdlHardcoverCandidates({ title: "しき", author: "町屋良平" }, { timeoutMs: 50 });
    expect(result).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("楽天のタイムアウト", () => {
  it("searchBooks shares one total timeout across pages and stops after an unresponsive second page", async () => {
    let page = 0;
    const calls = installFetch({
      ndl: hang,
      rakuten: async (init) => {
        if (++page > 1) return hang(init);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const response = await rakutenOk("9784309027180", "単行本")(init);
        const data = await response.json();
        return Response.json({ ...data, pageCount: 10 });
      },
    });
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      const started = Date.now();
      const result = await searchBooks({ title: "しき" }, { totalTimeoutMs: 200 });
      expect(result.map((book) => book.isbn)).toEqual(["9784309027180"]);
      expect(calls.rakuten).toHaveLength(2);
      expect(calls.rakuten[0]?.signal).toBe(calls.rakuten[1]?.signal);
      expect(calls.rakuten[1]?.signal?.aborted).toBe(true);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(timeout).toHaveBeenCalledWith(200);
      expect(Date.now() - started).toBeLessThan(800);
    } finally {
      timeout.mockRestore();
    }
  });

  it("retries a body timeout after receiving headers and returns the next successful response", async () => {
    let attempt = 0;
    const calls = installFetch({
      ndl: hang,
      rakuten: (init) => ++attempt === 1 ? hangBody(init) : rakutenOk("9784309027180", "単行本")(init),
    });
    const result = await searchBooksByIsbn("9784309027180", { timeoutMs: 50, totalTimeoutMs: 2000 });
    expect(result?.isbn).toBe("9784309027180");
    expect(calls.rakuten).toHaveLength(2);
    expect(calls.rakuten[0]?.signal?.aborted).toBe(true);
  });

  it("returns null without retrying when the total timeout interrupts the body", async () => {
    const calls = installFetch({ ndl: hang, rakuten: hangBody });
    const result = await searchBooksByIsbn("9784309027180", { timeoutMs: 1000, totalTimeoutMs: 50 });
    expect(result).toBeNull();
    expect(calls.rakuten).toHaveLength(1);
  });

  it("returns an empty page without retrying when the caller aborts during body reading", async () => {
    const controller = new AbortController();
    const calls = installFetch({ ndl: hang, rakuten: hangBody });
    const pending = fetchBookPage({ page: 1, hits: 30 }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(pending).resolves.toEqual({ items: [], pageCount: 0 });
    expect(calls.rakuten).toHaveLength(1);
  });

  it("retries JSON parse failures and returns the next successful page", async () => {
    let attempt = 0;
    const calls = installFetch({
      ndl: hang,
      rakuten: (init) => ++attempt === 1
        ? Promise.resolve(new Response("invalid JSON", { status: 200 }))
        : rakutenOk("9784309027180", "単行本")(init),
    });
    const result = await fetchBookPage({ page: 1, hits: 30 });
    expect(result.items[0]?.isbn).toBe("9784309027180");
    expect(result.pageCount).toBe(1);
    expect(calls.rakuten).toHaveLength(2);
  });

  it("リトライ全体の上限（totalTimeoutMs）を超えたら再試行せず null を返す", async () => {
    const calls = installFetch({ ndl: hang, rakuten: async () => new Response("", { status: 500 }) });
    const started = Date.now();
    const result = await searchBooksByIsbn("9784309027180", { totalTimeoutMs: 100 });
    expect(result).toBeNull();
    // 上限なしなら 500ms + 1000ms の待機を挟んで3回呼ぶ。上限内で打ち切られる
    expect(calls.rakuten.length).toBeLessThan(3);
    expect(Date.now() - started).toBeLessThan(800);
  });

  it("応答しない場合、1試行ごとの timeoutMs と全体上限で打ち切る", async () => {
    installFetch({ ndl: hang, rakuten: hang });
    const started = Date.now();
    const result = await searchBooksByIsbn("9784309027180", { timeoutMs: 50, totalTimeoutMs: 300 });
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("resolvePreferringHardcover の時間制限", () => {
  it("NDL が応答しなくても、タイムアウト後に楽天単行本を採用する", async () => {
    installFetch({ ndl: hang, rakuten: rakutenOk("9784309027180", "単行本") });
    const started = Date.now();
    const result = await resolvePreferringHardcover(target, { ndlTimeoutMs: 50 });
    expect(result).toMatchObject({ isbn: "9784309027180", source: "rakuten_hardcover" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("全体予算を超えたら残りを打ち切り、fallback で解決する", async () => {
    installFetch({ ndl: hang, rakuten: hang });
    const started = Date.now();
    const result = await resolvePreferringHardcover(target, { budgetMs: 100 });
    expect(result).toMatchObject({ isbn: "9784309417738", source: "fallback" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("parallelRakuten: NDL の応答を待つ間に楽天検索が開始されている", async () => {
    let releaseNdl!: () => void;
    const ndlGate = new Promise<void>((r) => (releaseNdl = r));
    const calls = installFetch({
      ndl: async () => {
        await ndlGate;
        return new Response(sruXml("", 0), { status: 200 });
      },
      rakuten: rakutenOk("9784309027180", "単行本"),
    });

    const pending = resolvePreferringHardcover(target, { parallelRakuten: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.rakuten).toHaveLength(1); // NDL が未応答でも楽天は先行して呼ばれている
    releaseNdl();

    const result = await pending;
    expect(result).toMatchObject({ isbn: "9784309027180", source: "rakuten_hardcover" });
    expect(calls.rakuten).toHaveLength(1); // 楽天検索は二重に呼ばれない
  });

  it("parallelRakuten: NDL が単行本を返したら NDL を優先し、先行した楽天検索を中断する", async () => {
    const calls = installFetch({ ndl: ok(sruXml(sruHardcover, 1)), rakuten: hang });

    const result = await resolvePreferringHardcover(target, { parallelRakuten: true });

    expect(result).toMatchObject({ isbn: "9784309027180", source: "ndl_hardcover" });
    expect(calls.rakuten).toHaveLength(1);
    expect(calls.rakuten[0]?.signal?.aborted).toBe(true);
  });

  it("parallelRakuten なしは従来どおり NDL が単行本を返せば楽天を呼ばない", async () => {
    const calls = installFetch({ ndl: ok(sruXml(sruHardcover, 1)), rakuten: hang });
    const result = await resolvePreferringHardcover(target);
    expect(result.source).toBe("ndl_hardcover");
    expect(calls.rakuten).toHaveLength(0);
  });

  it("ユーザー操作用の設定は NDL 4秒・楽天 3秒（合計5秒）・全体6秒・並行実行", () => {
    expect(USER_FACING_RESOLVE_OPTIONS).toEqual({
      ndlTimeoutMs: 4000,
      rakutenTimeoutMs: 3000,
      rakutenTotalTimeoutMs: 5000,
      budgetMs: 6000,
      parallelRakuten: true,
    });
  });
});
