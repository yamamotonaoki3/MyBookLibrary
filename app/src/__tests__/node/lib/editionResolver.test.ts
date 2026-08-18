import { resolvePreferringHardcover, collectEditionCandidates } from "@/lib/editionResolver";
import { mockFetchSequence, mockFetchText, restoreFetch } from "../../helpers/fetchMock";

const sruXml = (records: string, numberOfRecords: number) => `<?xml version="1.0"?>
<searchRetrieveResponse>
<numberOfRecords>${numberOfRecords}</numberOfRecords>
<records>${records}</records>
</searchRetrieveResponse>`;

const sruRecord = (opts: {
  title: string;
  creator?: string;
  identifier?: string;
  date?: string;
  extent?: string;
}) => `<record><recordData>
<dc:title>${opts.title}</dc:title>
${opts.creator !== undefined ? `<dc:creator>${opts.creator}</dc:creator>` : ""}
${opts.identifier !== undefined ? `<dc:identifier>${opts.identifier}</dc:identifier>` : ""}
${opts.date !== undefined ? `<dcterms:date>${opts.date}</dcterms:date>` : ""}
${opts.extent !== undefined ? `<dcterms:extent>${opts.extent}</dcterms:extent>` : ""}
</recordData></record>`;

function rakutenBook(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "しき",
    author: "町屋良平",
    largeImageUrl: "",
    publisherName: "河出文庫",
    salesDate: "2020年03月",
    isbn: "9784309417738",
    size: "文庫",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.RAKUTEN_APP_ID = "test-app-id";
  process.env.RAKUTEN_ACCESS_KEY = "test-access-key";
});

afterEach(() => {
  restoreFetch();
  delete process.env.RAKUTEN_APP_ID;
  delete process.env.RAKUTEN_ACCESS_KEY;
});

describe("resolvePreferringHardcover", () => {
  it("NDLに単行本があればそれを優先する（楽天は呼ばない）", async () => {
    const fetchFn = mockFetchText(
      sruXml(sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", extent: "172p ; 20cm" }), 1)
    );

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
    });

    expect(result).toMatchObject({ isbn: "9784309027180", source: "ndl_hardcover" });
    expect(fetchFn).toHaveBeenCalledTimes(1); // NDLのみ、楽天は呼ばれない
  });

  it("実例：町屋良平『しき』— NDLは単行本のみ、楽天は文庫のみ返す場合、単行本ISBNを採用する", async () => {
    mockFetchText(
      sruXml(sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", extent: "172p ; 20cm" }), 1)
    );

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
    });

    expect(result.isbn).toBe("9784309027180");
  });

  it("NDLに単行本が無く楽天に単行本がある場合、楽天単行本を採用する", async () => {
    mockFetchSequence([
      { text: sruXml("", 0) }, // NDL: ヒットなし
      { json: { Items: [rakutenBook({ isbn: "9784309027180", size: "単行本" })], pageCount: 1 } }, // 楽天
    ]);

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
    });

    expect(result).toMatchObject({ isbn: "9784309027180", source: "rakuten_hardcover" });
  });

  it("NDL・楽天どちらにも単行本が無ければfallbackを返す", async () => {
    mockFetchSequence([
      { text: sruXml("", 0) }, // NDL: ヒットなし
      { json: { Items: [rakutenBook({ size: "文庫" })], pageCount: 1 } }, // 楽天: 文庫のみ
    ]);

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
    });

    expect(result).toMatchObject({ isbn: "9784309417738", source: "fallback" });
  });

  it("NDLがエラーでも楽天単行本にフォールバックする", async () => {
    mockFetchSequence([
      { status: 500 }, // NDL: エラー
      { json: { Items: [rakutenBook({ isbn: "9784309027180", size: "単行本" })], pageCount: 1 } },
    ]);

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "9784309417738" },
    });

    expect(result).toMatchObject({ isbn: "9784309027180", source: "rakuten_hardcover" });
  });

  it("fallback.isbnが空でNDL・楽天とも見つからない場合、NDL元データにフォールバックする", async () => {
    mockFetchSequence([
      { text: sruXml("", 0) }, // NDL単行本検索: ヒットなし
      { json: { Items: [], pageCount: 1 } }, // 楽天: ヒットなし
      { text: sruXml(sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309999999" }), 1) }, // NDL元データ
    ]);

    const result = await resolvePreferringHardcover({
      title: "しき",
      author: "町屋良平",
      fallback: { title: "しき", author: "町屋良平", isbn: "" },
    });

    expect(result).toMatchObject({ isbn: "9784309999999", source: "ndl_fallback" });
  });
});

describe("collectEditionCandidates", () => {
  it("NDL単行本と楽天文庫が異なるISBNの場合、両方を候補として残す（重複排除しない）", async () => {
    mockFetchSequence([
      { text: sruXml(sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", extent: "172p ; 20cm" }), 1) },
      { json: { Items: [rakutenBook({ isbn: "9784309417738", size: "文庫" })], pageCount: 1 } },
    ]);

    const result = await collectEditionCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.isbn).sort()).toEqual(["9784309027180", "9784309417738"]);
  });

  it("同一ISBNがNDL・楽天両方から来た場合は1件に統合する", async () => {
    mockFetchSequence([
      { text: sruXml(sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", extent: "172p ; 20cm" }), 1) },
      { json: { Items: [rakutenBook({ isbn: "9784309027180", size: "単行本" })], pageCount: 1 } },
    ]);

    const result = await collectEditionCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe("ndl");
  });

  it("isPlausibleMatchを満たさない楽天候補は除外する", async () => {
    mockFetchSequence([
      { text: sruXml("", 0) },
      { json: { Items: [rakutenBook({ title: "別の本", isbn: "9784000000001" })], pageCount: 1 } },
    ]);

    const result = await collectEditionCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toEqual([]);
  });

  it("NDL・楽天ともヒットなしなら空配列を返す", async () => {
    mockFetchSequence([{ text: sruXml("", 0) }, { json: { Items: [], pageCount: 1 } }]);

    const result = await collectEditionCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toEqual([]);
  });
});
