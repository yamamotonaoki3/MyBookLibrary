import { searchLibraries, checkAvailability, checkAvailabilityByIsbn } from "@/lib/calil";
import { mockFetchJson, mockFetchSequence, restoreFetch } from "../../helpers/fetchMock";

beforeEach(() => {
  process.env.CALIL_API_KEY = "test-api-key";
});

afterEach(() => {
  restoreFetch();
  jest.useRealTimers();
  delete process.env.CALIL_API_KEY;
});

describe("searchLibraries", () => {
  it("配列レスポンスをそのまま返す", async () => {
    mockFetchJson([{ systemid: "Tokyo_Setagaya", systemname: "世田谷区", libkey: "", formal: "", pref: "東京都", city: "", address: "" }]);

    const result = await searchLibraries("東京都");

    expect(result).toHaveLength(1);
    expect(result[0].systemid).toBe("Tokyo_Setagaya");
  });

  it("配列以外のレスポンスは空配列を返す", async () => {
    mockFetchJson({ error: "invalid" });

    const result = await searchLibraries("東京都");

    expect(result).toEqual([]);
  });

  it("HTTPエラー時は例外を投げる", async () => {
    mockFetchJson({}, { status: 500 });

    await expect(searchLibraries("東京都")).rejects.toThrow("カーリルAPI図書館検索に失敗しました");
  });

  it("CALIL_API_KEYが未設定なら例外を投げる", async () => {
    delete process.env.CALIL_API_KEY;

    await expect(searchLibraries("東京都")).rejects.toThrow("CALIL_API_KEY is not set");
  });

  it("cityを指定するとURLにcityパラメータが含まれる", async () => {
    const fetchFn = mockFetchJson([]);

    await searchLibraries("東京都", "世田谷区");

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("city")).toBe("世田谷区");
  });
});

type Fn = typeof checkAvailability | typeof checkAvailabilityByIsbn;

// checkAvailability / checkAvailabilityByIsbn 共通のポーリング挙動を検証する。
// 戻り値の形状（配列 or ISBNごとのグルーピング）が異なるため、
// 呼び出し結果は最初の要素・エントリを取り出すヘルパーで吸収する。
function firstResult(fnName: string, resultAny: unknown): { loanStatus: string } | undefined {
  if (fnName === "checkAvailability") {
    const arr = resultAny as { loanStatus: string }[];
    return arr[0];
  }
  const grouped = resultAny as Record<string, { loanStatus: string }[]>;
  const values = Object.values(grouped).flat();
  return values[0];
}

describe.each<[string, Fn]>([
  ["checkAvailability", checkAvailability],
  ["checkAvailabilityByIsbn", checkAvailabilityByIsbn],
])("%s (共通ポーリング挙動)", (fnName, fn) => {
  it("continueが0ならポーリングせず結果を返す", async () => {
    const fetchFn = mockFetchJson({
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

    const result = await fn(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(firstResult(fnName, result)).toEqual({
      systemid: "Tokyo_Setagaya",
      libkey: "玉川台",
      loanStatus: "貸出可",
      reserveurl: "https://example.test/reserve",
    });
  });

  it("continueが1の間はポーリングし、sessionを引き継いだ最終結果を使う", async () => {
    jest.useFakeTimers();
    const fetchFn = mockFetchSequence([
      { json: { continue: 1, session: "session-abc", books: {} } },
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

    const promise = fn(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const firstCallUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(firstCallUrl.searchParams.get("isbn")).toBe("9784000000001");
    const secondCallUrl = new URL(fetchFn.mock.calls[1][0] as string);
    expect(secondCallUrl.searchParams.get("session")).toBe("session-abc");
    expect(secondCallUrl.searchParams.has("isbn")).toBe(false);
    expect(firstResult(fnName, result)?.loanStatus).toBe("貸出中");
  });

  it("2秒未満では次のポーリングが発生しない", async () => {
    jest.useFakeTimers();
    const fetchFn = mockFetchSequence([
      { json: { continue: 1, session: "s1", books: {} } },
      { json: { continue: 0, books: {} } },
    ]);

    const promise = fn(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(1999);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(200);
    await promise;
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("continueが1のまま続く場合はデッドラインで打ち切る", async () => {
    jest.useFakeTimers();
    const fetchFn = mockFetchJson({ continue: 1, session: "forever", books: {} });

    const promise = fn(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(25000);
    await promise;

    // 2秒間隔で20秒デッドラインまでポーリングし続け、無限ループにはならないこと
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(fetchFn.mock.calls.length).toBeLessThan(14);
  });

  it("HTTPエラー時は例外を投げる", async () => {
    mockFetchJson({}, { status: 500 });

    await expect(fn(["9784000000001"], ["Tokyo_Setagaya"])).rejects.toThrow(
      "カーリルAPI貸出状況確認に失敗しました"
    );
  });

  it("CALIL_API_KEYが未設定なら例外を投げる", async () => {
    delete process.env.CALIL_API_KEY;

    await expect(fn(["9784000000001"], ["Tokyo_Setagaya"])).rejects.toThrow(
      "CALIL_API_KEY is not set"
    );
  });
});

describe("checkAvailability", () => {
  it("libkeyが空（蔵書なし）のシステムは「蔵書なし」として返す", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: {} },
        },
      },
    });

    const result = await checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(result).toEqual([
      { systemid: "Tokyo_Setagaya", libkey: "", loanStatus: "蔵書なし", reserveurl: "" },
    ]);
  });

  it("同一systemid+libkeyの結果が複数ISBNで競合する場合「蔵書なし」以外を優先する", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: { 玉川台: "蔵書なし" } },
        },
        "9784000000002": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: { 玉川台: "貸出可" } },
        },
      },
    });

    const result = await checkAvailability(
      ["9784000000001", "9784000000002"],
      ["Tokyo_Setagaya"]
    );

    expect(result).toEqual([
      { systemid: "Tokyo_Setagaya", libkey: "玉川台", loanStatus: "貸出可", reserveurl: "" },
    ]);
  });

  it("systemid+libkeyの組が異なる結果は別エントリとして両方残す", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: {} },
        },
        "9784000000002": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: { 玉川台: "貸出可" } },
        },
      },
    });

    const result = await checkAvailability(
      ["9784000000001", "9784000000002"],
      ["Tokyo_Setagaya"]
    );

    expect(result).toEqual(
      expect.arrayContaining([
        { systemid: "Tokyo_Setagaya", libkey: "", loanStatus: "蔵書なし", reserveurl: "" },
        { systemid: "Tokyo_Setagaya", libkey: "玉川台", loanStatus: "貸出可", reserveurl: "" },
      ])
    );
    expect(result).toHaveLength(2);
  });

  it("該当するsystemidのデータが無ければ結果に含めない", async () => {
    mockFetchJson({ continue: 0, books: { "9784000000001": {} } });

    const result = await checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(result).toEqual([]);
  });
});

describe("checkAvailabilityByIsbn", () => {
  it("複数ISBNを指定すると1回のfetchでカンマ区切りのisbnを送る", async () => {
    const fetchFn = mockFetchJson({ continue: 0, books: {} });

    await checkAvailabilityByIsbn(
      ["9784000000001", "9784000000002"],
      ["Tokyo_Setagaya"]
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("isbn")).toBe("9784000000001,9784000000002");
  });

  it("ISBNごとの結果はマージされず、それぞれの状態を保持する", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: { 玉川台: "貸出可" } },
        },
        "9784000000002": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: {} },
        },
      },
    });

    const result = await checkAvailabilityByIsbn(
      ["9784000000001", "9784000000002"],
      ["Tokyo_Setagaya"]
    );

    expect(result["9784000000001"]).toEqual([
      { systemid: "Tokyo_Setagaya", libkey: "玉川台", loanStatus: "貸出可", reserveurl: "" },
    ]);
    expect(result["9784000000002"]).toEqual([
      { systemid: "Tokyo_Setagaya", libkey: "", loanStatus: "蔵書なし", reserveurl: "" },
    ]);
  });

  it("レスポンスに存在しないISBNは空配列になる", async () => {
    mockFetchJson({ continue: 0, books: {} });

    const result = await checkAvailabilityByIsbn(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(result["9784000000001"]).toEqual([]);
  });

  it("libkeyが空（蔵書なし）のISBNは「蔵書なし」として返す", async () => {
    mockFetchJson({
      continue: 0,
      books: {
        "9784000000001": {
          Tokyo_Setagaya: { status: "OK", reserveurl: "", libkey: {} },
        },
      },
    });

    const result = await checkAvailabilityByIsbn(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(result["9784000000001"]).toEqual([
      { systemid: "Tokyo_Setagaya", libkey: "", loanStatus: "蔵書なし", reserveurl: "" },
    ]);
  });
});
