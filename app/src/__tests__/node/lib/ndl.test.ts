import {
  searchBooksNdl,
  searchBookByIsbn,
  getAuthorBookCountNdl,
  searchAuthorsByName,
  parseExtentCm,
  isLikelyHardcoverByExtent,
  searchNdlHardcoverCandidates,
  searchNdlPreferHardcover,
} from "@/lib/ndl";
import { mockFetchText, mockFetchNetworkError, restoreFetch } from "../../helpers/fetchMock";

const sruXml = (records: string, numberOfRecords = 2) => `<?xml version="1.0"?>
<searchRetrieveResponse>
<numberOfRecords>${numberOfRecords}</numberOfRecords>
<records>${records}</records>
</searchRetrieveResponse>`;

const sruRecord = (opts: {
  title: string;
  creator?: string;
  publisher?: string;
  date?: string;
  identifier?: string;
  extent?: string;
}) => `<record><recordData>
<dc:title>${opts.title}</dc:title>
${opts.creator !== undefined ? `<dc:creator>${opts.creator}</dc:creator>` : ""}
${opts.publisher !== undefined ? `<dc:publisher>${opts.publisher}</dc:publisher>` : ""}
${opts.date !== undefined ? `<dcterms:date>${opts.date}</dcterms:date>` : ""}
${opts.identifier !== undefined ? `<dc:identifier>${opts.identifier}</dc:identifier>` : ""}
${opts.extent !== undefined ? `<dcterms:extent>${opts.extent}</dcterms:extent>` : ""}
</recordData></record>`;

afterEach(() => {
  restoreFetch();
});

describe("searchBooksNdl", () => {
  it("SRUレスポンスをパースしてitemsとtotalPagesを返す", async () => {
    const xml = sruXml(
      sruRecord({
        title: "こころ",
        creator: "夏目 漱石",
        publisher: "岩波書店",
        date: "2000",
        identifier: "ISBN 9784000000001",
      }),
      65
    );
    mockFetchText(xml);

    const result = await searchBooksNdl({ type: "title", q: "こころ", page: 1 });

    expect(result.items).toEqual([
      {
        title: "こころ",
        author: "夏目 漱石",
        isbn: "9784000000001",
        publisherName: "岩波書店",
        salesDate: "2000年",
        extent: "",
      },
    ]);
    expect(result.totalPages).toBe(3); // Math.ceil(65 / 30)
  });

  it("年月付きの日付は「YYYY年MM月」形式に整形する", async () => {
    mockFetchText(sruXml(sruRecord({ title: "坊っちゃん", date: "1999.05" }), 1));

    const result = await searchBooksNdl({ type: "title", q: "坊っちゃん", page: 1 });

    expect(result.items[0].salesDate).toBe("1999年05月");
  });

  it("正規化後のタイトルが重複するレコードは最初の1件のみ残す", async () => {
    const xml = sruXml(
      sruRecord({ title: "こころ" }) + sruRecord({ title: "こころ　" }),
      2
    );
    mockFetchText(xml);

    const result = await searchBooksNdl({ type: "title", q: "こころ", page: 1 });

    expect(result.items).toHaveLength(1);
  });

  it("titleタグが無いレコードは除外する", async () => {
    const xml = sruXml(`<record><recordData><dc:creator>著者</dc:creator></recordData></record>`, 1);
    mockFetchText(xml);

    const result = await searchBooksNdl({ type: "title", q: "x", page: 1 });

    expect(result.items).toEqual([]);
  });

  it.each([
    ["title" as const, "こころ", 'title="こころ"'],
    ["author" as const, "夏目漱石", 'creator="夏目漱石"'],
  ])("type=%sのときクエリを%sの形式で組み立てる", async (type, q, expectedQuery) => {
    const fetchFn = mockFetchText(sruXml("", 0));

    await searchBooksNdl({ type, q, page: 1 });

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("query")).toBe(expectedQuery);
  });

  it("type=keywordで複数語を指定するとtitleとcreatorのAND条件になる", async () => {
    const fetchFn = mockFetchText(sruXml("", 0));

    await searchBooksNdl({ type: "keyword", q: "こころ 夏目漱石", page: 1 });

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("query")).toBe('title="こころ" AND creator="夏目漱石"');
  });

  it("type=titleAndAuthorはスペース分割せずtitle/authorをそれぞれAND条件にする（スペースを含むタイトルの誤分割対策）", async () => {
    const fetchFn = mockFetchText(sruXml("", 0));

    await searchBooksNdl({
      type: "titleAndAuthor",
      title: "新約 とある魔術の禁書目録",
      author: "鎌池和馬",
      page: 1,
    });

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("query")).toBe(
      'title="新約 とある魔術の禁書目録" AND creator="鎌池和馬"'
    );
  });

  it("type=anywhereはフィールド指定なしの全文検索クエリになる", async () => {
    const fetchFn = mockFetchText(sruXml("", 0));

    await searchBooksNdl({ type: "anywhere", q: "こころ 夏目漱石", page: 1 });

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("query")).toBe('anywhere="こころ 夏目漱石"');
  });

  it("2ページ目はstartRecordが31になる", async () => {
    const fetchFn = mockFetchText(sruXml("", 0));

    await searchBooksNdl({ type: "title", q: "x", page: 2 });

    const calledUrl = new URL(fetchFn.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("startRecord")).toBe("31");
  });

  it("HTTPエラー時は空items・totalPages 0を返す", async () => {
    mockFetchText("", { status: 500 });

    const result = await searchBooksNdl({ type: "title", q: "x", page: 1 });

    expect(result).toEqual({ items: [], totalPages: 0 });
  });

  it("通信エラー時は空items・totalPages 0を返す", async () => {
    mockFetchNetworkError();

    const result = await searchBooksNdl({ type: "title", q: "x", page: 1 });

    expect(result).toEqual({ items: [], totalPages: 0 });
  });
});

describe("parseExtentCm", () => {
  it.each([
    ["172p ; 20cm", 20],
    ["305p ; 15cm", 15],
    ["172p ; 20.5cm", 20.5],
    ["172p", null],
  ])("「%s」から%scmを抽出する", (extent, expected) => {
    expect(parseExtentCm(extent)).toBe(expected);
  });
});

describe("isLikelyHardcoverByExtent", () => {
  it.each([
    ["172p ; 20cm", true],
    ["188p ; 15cm", false],
    ["172p ; 18cm", true],
    ["172p ; 17.9cm", false],
    ["172p", false],
  ])("「%s」の単行本らしさ判定は%sになる", (extent, expected) => {
    expect(isLikelyHardcoverByExtent(extent)).toBe(expected);
  });
});

describe("searchNdlHardcoverCandidates / searchNdlPreferHardcover", () => {
  it("単行本・文庫が混在する場合、単行本らしいものを先頭に並べる（重複排除しない）", async () => {
    const xml = sruXml(
      sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309417738", date: "2020", extent: "188p ; 15cm" }) +
        sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", date: "2018", extent: "172p ; 20cm" }),
      2
    );
    mockFetchText(xml);

    const result = await searchNdlHardcoverCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toHaveLength(2);
    expect(result[0].isbn).toBe("9784309027180");
    expect(result[0].isLikelyHardcover).toBe(true);
    expect(result[1].isbn).toBe("9784309417738");
    expect(result[1].isLikelyHardcover).toBe(false);
  });

  it("isPlausibleMatchを満たさない候補は除外する", async () => {
    const xml = sruXml(
      sruRecord({ title: "しき", creator: "別の著者", identifier: "ISBN 9784000000001", extent: "172p ; 20cm" }),
      1
    );
    mockFetchText(xml);

    const result = await searchNdlHardcoverCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toEqual([]);
  });

  it("ISBNが無い候補は除外する", async () => {
    const xml = sruXml(sruRecord({ title: "しき", creator: "町屋良平", extent: "172p ; 20cm" }), 1);
    mockFetchText(xml);

    const result = await searchNdlHardcoverCandidates({ title: "しき", author: "町屋良平" });

    expect(result).toEqual([]);
  });

  it("単行本候補が複数（刊行年月違い）ある場合、最も古い版を先頭にする", async () => {
    const xml = sruXml(
      sruRecord({ title: "本", creator: "著者A", identifier: "ISBN 9784000000002", date: "2020.05", extent: "172p ; 20cm" }) +
        sruRecord({ title: "本", creator: "著者A", identifier: "ISBN 9784000000001", date: "2018.03", extent: "172p ; 20cm" }),
      2
    );
    mockFetchText(xml);

    const result = await searchNdlHardcoverCandidates({ title: "本", author: "著者A" });

    expect(result[0].isbn).toBe("9784000000001");
  });

  it("fetch失敗時は空配列を返す", async () => {
    mockFetchText("", { status: 500 });

    const result = await searchNdlHardcoverCandidates({ title: "本", author: "著者A" });

    expect(result).toEqual([]);
  });

  it("searchNdlPreferHardcoverは単行本候補が無ければnullを返す", async () => {
    const xml = sruXml(
      sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309417738", extent: "188p ; 15cm" }),
      1
    );
    mockFetchText(xml);

    const result = await searchNdlPreferHardcover({ title: "しき", author: "町屋良平" });

    expect(result).toBeNull();
  });

  it("searchNdlPreferHardcoverは単行本候補があればそれを返す", async () => {
    const xml = sruXml(
      sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309417738", extent: "188p ; 15cm" }) +
        sruRecord({ title: "しき", creator: "町屋良平", identifier: "ISBN 9784309027180", extent: "172p ; 20cm" }),
      2
    );
    mockFetchText(xml);

    const result = await searchNdlPreferHardcover({ title: "しき", author: "町屋良平" });

    expect(result?.isbn).toBe("9784309027180");
  });
});

describe("searchBookByIsbn", () => {
  const openSearchXml = (opts: {
    title?: string;
    creator?: string;
    publisher?: string;
    pubDate?: string;
  }) => `<?xml version="1.0"?>
<rss><channel><item>
${opts.title !== undefined ? `<title>${opts.title}</title>` : ""}
${opts.creator !== undefined ? `<dc:creator>${opts.creator}</dc:creator>` : ""}
${opts.publisher !== undefined ? `<dc:publisher>${opts.publisher}</dc:publisher>` : ""}
${opts.pubDate !== undefined ? `<pubDate>${opts.pubDate}</pubDate>` : ""}
</item></channel></rss>`;

  it("タイトルの「/ 著者名」サフィックスを除去する", async () => {
    mockFetchText(
      openSearchXml({
        title: "こころ / 夏目 漱石 著",
        creator: "夏目, 漱石, 1867-1916",
        publisher: "岩波書店",
        pubDate: "2000-01-01",
      })
    );

    const result = await searchBookByIsbn("9784000000001");

    expect(result).toEqual({
      title: "こころ",
      author: "夏目漱石",
      publisher: "岩波書店",
      pubdate: "2000-01-01",
    });
  });

  it("生年を含まないdc:creatorはそのまま結合して使う", async () => {
    mockFetchText(openSearchXml({ title: "坊っちゃん", creator: "夏目 漱石" }));

    const result = await searchBookByIsbn("9784000000002");

    expect(result?.author).toBe("夏目漱石");
  });

  it("titleタグが無ければnullを返す", async () => {
    mockFetchText(openSearchXml({}));

    const result = await searchBookByIsbn("9784000000003");

    expect(result).toBeNull();
  });

  it("HTTPエラー時はnullを返す", async () => {
    mockFetchText("", { status: 500 });

    const result = await searchBookByIsbn("9784000000004");

    expect(result).toBeNull();
  });
});

describe("getAuthorBookCountNdl", () => {
  it("numberOfRecordsを数値で返す", async () => {
    mockFetchText(sruXml("", 12));

    const result = await getAuthorBookCountNdl("夏目漱石");

    expect(result).toBe(12);
  });

  it("HTTPエラー時は0を返す", async () => {
    mockFetchText("", { status: 500 });

    const result = await getAuthorBookCountNdl("夏目漱石");

    expect(result).toBe(0);
  });

  it("通信エラー時は0を返す", async () => {
    mockFetchNetworkError();

    const result = await getAuthorBookCountNdl("夏目漱石");

    expect(result).toBe(0);
  });
});

describe("searchAuthorsByName", () => {
  const openSearchAuthorsXml = (creators: string[]) => `<?xml version="1.0"?>
<rss><channel>
${creators.map((c) => `<item><dc:creator>${c}</dc:creator></item>`).join("\n")}
</channel></rss>`;

  it("生年付きの著者名を正規化して重複除去する", async () => {
    mockFetchText(
      openSearchAuthorsXml(["夏目, 漱石, 1867-1916", "夏目, 漱石, 1867-1916", "芥川, 龍之介, 1892-1927"])
    );

    const result = await searchAuthorsByName("夏目");

    expect(result.sort()).toEqual(["夏目漱石", "芥川龍之介"].sort());
  });

  it("生年を含まない著者名はそのまま使う", async () => {
    mockFetchText(openSearchAuthorsXml(["村上春樹"]));

    const result = await searchAuthorsByName("村上");

    expect(result).toEqual(["村上春樹"]);
  });

  it("HTTPエラー時は空配列を返す", async () => {
    mockFetchText("", { status: 500 });

    const result = await searchAuthorsByName("x");

    expect(result).toEqual([]);
  });
});
