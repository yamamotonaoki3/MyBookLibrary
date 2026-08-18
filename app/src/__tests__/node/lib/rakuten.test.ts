import {
  fetchBookPage,
  searchBooks,
  getAuthorBookCount,
  searchBooksByIsbn,
  deduplicateByTitle,
  normalizeTitle,
  normalizeAuthor,
  isNonBookSize,
  type RakutenBook,
} from "@/lib/rakuten";
import { mockFetchJson, mockFetchSequence, restoreFetch } from "../../helpers/fetchMock";

jest.mock("@/lib/ndl", () => ({
  getAuthorBookCountNdl: jest.fn(),
}));

function makeBook(overrides: Partial<RakutenBook> = {}): RakutenBook {
  return {
    title: "サンプル本",
    author: "著者A",
    largeImageUrl: "",
    publisherName: "出版社",
    salesDate: "2020年01月",
    isbn: "9784000000000",
    size: "",
    ...overrides,
  };
}

describe("rakuten", () => {
  beforeEach(() => {
    process.env.RAKUTEN_APP_ID = "test-app-id";
    process.env.RAKUTEN_ACCESS_KEY = "test-access-key";
  });

  afterEach(() => {
    restoreFetch();
    delete process.env.RAKUTEN_APP_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
  });

  describe("fetchBookPage", () => {
    it("正常時はitemsとpageCountを返す", async () => {
      mockFetchJson({ Items: [makeBook()], pageCount: 3 });

      const result = await fetchBookPage({ page: 1, hits: 30 });

      expect(result.items).toHaveLength(1);
      expect(result.pageCount).toBe(3);
    });

    it("429を3回連続で受けるとリトライ上限に達し空配列を返す", async () => {
      jest.useFakeTimers();
      const fetchFn = mockFetchJson({}, { status: 429 });

      const promise = fetchBookPage({ page: 1, hits: 30 });
      await jest.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toEqual({ items: [], pageCount: 0 });
      expect(fetchFn).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it("429の後に成功すればリトライを打ち切り結果を返す", async () => {
      jest.useFakeTimers();
      const fetchFn = mockFetchSequence([
        { status: 429 },
        { json: { Items: [makeBook()], pageCount: 1 } },
      ]);

      const promise = fetchBookPage({ page: 1, hits: 30 });
      await jest.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result.pageCount).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it("429以外のHTTPエラーは即座に空配列を返す（リトライしない）", async () => {
      const fetchFn = mockFetchJson({}, { status: 500 });

      const result = await fetchBookPage({ page: 1, hits: 30 });

      expect(result).toEqual({ items: [], pageCount: 0 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("Itemsが無いレスポンスは空配列を返す", async () => {
      mockFetchJson({});

      const result = await fetchBookPage({ page: 1, hits: 30 });

      expect(result.items).toEqual([]);
      expect(result.pageCount).toBe(1);
    });

    it("author/titleパラメータをURLに含める", async () => {
      const fetchFn = mockFetchJson({ Items: [], pageCount: 1 });

      await fetchBookPage({ author: "夏目漱石", title: "こころ", page: 1, hits: 30 });

      const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get("author")).toBe("夏目漱石");
      expect(calledUrl.searchParams.get("title")).toBe("こころ");
    });
  });

  describe("searchBooks", () => {
    it("pageCountが1以下なら1回のみ取得する", async () => {
      const fetchFn = mockFetchJson({ Items: [makeBook()], pageCount: 1 });

      const result = await searchBooks({ title: "こころ" });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it("pageCountが2以上なら2ページ目以降も逐次取得する", async () => {
      const fetchFn = mockFetchSequence([
        { json: { Items: [makeBook({ title: "本1" })], pageCount: 3 } },
        { json: { Items: [makeBook({ title: "本2" })] } },
        { json: { Items: [makeBook({ title: "本3" })] } },
      ]);

      const result = await searchBooks({ title: "テスト" });

      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(result.map((b) => b.title).sort()).toEqual(["本1", "本2", "本3"]);
    });

    it("maxPagesを指定すると取得ページ数が制限される", async () => {
      const fetchFn = mockFetchSequence([
        { json: { Items: [makeBook({ title: "本1" })], pageCount: 5 } },
        { json: { Items: [makeBook({ title: "本2" })] } },
      ]);

      await searchBooks({ title: "テスト", maxPages: 2 });

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("結果はタイトル＋著者で重複除去される", async () => {
      mockFetchJson({
        Items: [makeBook({ title: "同じ本" }), makeBook({ title: "同じ本" })],
        pageCount: 1,
      });

      const result = await searchBooks({ title: "同じ本" });

      expect(result).toHaveLength(1);
    });
  });

  describe("getAuthorBookCount", () => {
    it("楽天APIがcount>0を返せばそれを使う", async () => {
      mockFetchJson({ count: 5 });

      const result = await getAuthorBookCount("夏目漱石");

      expect(result).toBe(5);
    });

    it("楽天APIがcount=0を返せばNDLへフォールバックする", async () => {
      const { getAuthorBookCountNdl } = jest.requireMock("@/lib/ndl") as {
        getAuthorBookCountNdl: jest.Mock;
      };
      getAuthorBookCountNdl.mockResolvedValue(7);
      mockFetchJson({ count: 0 });

      const result = await getAuthorBookCount("夏目漱石");

      expect(result).toBe(7);
      expect(getAuthorBookCountNdl).toHaveBeenCalledWith("夏目漱石");
    });

    it("楽天APIが失敗（fetchが例外）すればNDLへフォールバックする", async () => {
      const { getAuthorBookCountNdl } = jest.requireMock("@/lib/ndl") as {
        getAuthorBookCountNdl: jest.Mock;
      };
      getAuthorBookCountNdl.mockResolvedValue(3);
      globalThis.fetch = jest.fn(async () => {
        throw new Error("network error");
      }) as unknown as typeof globalThis.fetch;

      const result = await getAuthorBookCount("夏目漱石");

      expect(result).toBe(3);
    });

    it("楽天APIがエラーレスポンスを返せばNDLへフォールバックする", async () => {
      const { getAuthorBookCountNdl } = jest.requireMock("@/lib/ndl") as {
        getAuthorBookCountNdl: jest.Mock;
      };
      getAuthorBookCountNdl.mockResolvedValue(2);
      mockFetchJson({}, { status: 500 });

      const result = await getAuthorBookCount("夏目漱石");

      expect(result).toBe(2);
    });
  });

  describe("searchBooksByIsbn", () => {
    it("該当する本があれば最初の1件を返す", async () => {
      mockFetchJson({ Items: [makeBook({ isbn: "9784000000001" })] });

      const result = await searchBooksByIsbn("9784000000001");

      expect(result?.isbn).toBe("9784000000001");
    });

    it("Itemsが空なら null を返す", async () => {
      mockFetchJson({ Items: [] });

      const result = await searchBooksByIsbn("9784000000001");

      expect(result).toBeNull();
    });

    it("HTTPエラーなら null を返す", async () => {
      mockFetchJson({}, { status: 500 });

      const result = await searchBooksByIsbn("9784000000001");

      expect(result).toBeNull();
    });
  });

  describe("normalizeTitle / normalizeAuthor", () => {
    it("前後・中間の空白を除去し全角半角を正規化する", () => {
      expect(normalizeTitle("  こころ　")).toBe("こころ");
      expect(normalizeAuthor(" 夏目　漱石 ")).toBe("夏目漱石");
    });

    it.each([
      ["丸岡　明／著", "丸岡明"],
      ["逸見広 著", "逸見広"],
      ["打木村治 編", "打木村治"],
      ["田中千禾夫 編纂", "田中千禾夫"],
    ])("末尾の役割表記「%s」を除去して「%s」にする", (input, expected) => {
      expect(normalizeAuthor(input)).toBe(expected);
    });

    it("役割表記が付いていない氏名はそのまま変化しない", () => {
      expect(normalizeAuthor("夏目漱石")).toBe("夏目漱石");
    });
  });

  describe("isNonBookSize", () => {
    it.each(["ムック", "カセットテープ", "CD", "DVD", "Blu-ray", "ブルーレイ", "卓上カレンダー"])(
      "「%s」は読書管理の対象外と判定する",
      (size) => {
        expect(isNonBookSize(size)).toBe(true);
      }
    );

    it.each(["単行本", "文庫", "新書", ""])("「%s」は読書管理の対象と判定する", (size) => {
      expect(isNonBookSize(size)).toBe(false);
    });
  });

  describe("deduplicateByTitle", () => {
    it("タイトル＋著者が同じ本は形式の優先度が高い方を残す（単行本 > 新書 > 文庫）", () => {
      const books = [
        makeBook({ title: "同じ本", author: "同じ著者", size: "文庫" }),
        makeBook({ title: "同じ本", author: "同じ著者", size: "単行本" }),
      ];

      const result = deduplicateByTitle(books);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe("単行本");
    });

    it("形式の優先度が同じなら出版日が最も古い方を残す", () => {
      const books = [
        makeBook({ title: "同じ本", author: "同じ著者", size: "文庫", salesDate: "2021年05月" }),
        makeBook({ title: "同じ本", author: "同じ著者", size: "文庫", salesDate: "2020年01月" }),
      ];

      const result = deduplicateByTitle(books);

      expect(result).toHaveLength(1);
      expect(result[0].salesDate).toBe("2020年01月");
    });

    it("タイトルが同じでも著者が異なれば別の本として扱う", () => {
      const books = [
        makeBook({ title: "青天", author: "著者A" }),
        makeBook({ title: "青天", author: "著者B" }),
      ];

      const result = deduplicateByTitle(books);

      expect(result).toHaveLength(2);
    });
  });

  describe("getCredentials（間接検証）", () => {
    it("RAKUTEN_APP_IDが未設定なら例外を投げる", async () => {
      delete process.env.RAKUTEN_APP_ID;

      await expect(fetchBookPage({ page: 1, hits: 30 })).rejects.toThrow(
        "RAKUTEN_APP_ID is not set"
      );
    });

    it("RAKUTEN_ACCESS_KEYが未設定なら例外を投げる", async () => {
      delete process.env.RAKUTEN_ACCESS_KEY;

      await expect(fetchBookPage({ page: 1, hits: 30 })).rejects.toThrow(
        "RAKUTEN_ACCESS_KEY is not set"
      );
    });
  });
});
