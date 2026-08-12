import { searchLibraries, checkAvailability } from "@/lib/calil";
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

describe("checkAvailability", () => {
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

    const result = await checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        systemid: "Tokyo_Setagaya",
        libkey: "玉川台",
        loanStatus: "貸出可",
        reserveurl: "https://example.test/reserve",
      },
    ]);
  });

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

  it("continueが1の間は2秒間隔でポーリングし、0になった時点の結果を返す", async () => {
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

    const promise = checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondCallUrl = new URL(fetchFn.mock.calls[1][0] as string);
    expect(secondCallUrl.searchParams.get("session")).toBe("session-abc");
    expect(result[0].loanStatus).toBe("貸出中");
  });

  it("継続が2秒未満の間隔でポーリングされることはない", async () => {
    jest.useFakeTimers();
    const fetchFn = mockFetchSequence([
      { json: { continue: 1, session: "s1", books: {} } },
      { json: { continue: 0, books: {} } },
    ]);

    const promise = checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(1900);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(200);
    await promise;
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("20秒のデッドラインを超えたらcontinueが1のままでもその時点の結果で打ち切る", async () => {
    jest.useFakeTimers();
    const fetchFn = mockFetchJson({ continue: 1, session: "forever", books: {} });

    const promise = checkAvailability(["9784000000001"], ["Tokyo_Setagaya"]);
    await jest.advanceTimersByTimeAsync(25000);
    const result = await promise;

    expect(result).toEqual([]);
    // 2秒間隔で20秒デッドラインまでポーリングし続け、無限ループにはならないこと
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(fetchFn.mock.calls.length).toBeLessThan(15);
  });

  it("HTTPエラー時は例外を投げる", async () => {
    mockFetchJson({}, { status: 500 });

    await expect(checkAvailability(["9784000000001"], ["Tokyo_Setagaya"])).rejects.toThrow(
      "カーリルAPI貸出状況確認に失敗しました"
    );
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

  it("CALIL_API_KEYが未設定なら例外を投げる", async () => {
    delete process.env.CALIL_API_KEY;

    await expect(checkAvailability(["9784000000001"], ["Tokyo_Setagaya"])).rejects.toThrow(
      "CALIL_API_KEY is not set"
    );
  });
});
