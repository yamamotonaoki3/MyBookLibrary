const mockQueryRaw = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import { getRecommendedUsers } from "@/lib/userRecommendations";

describe("getRecommendedUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("COUNT(DISTINCT)の結果が文字列で返っても数値に変換する", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        userId: 2,
        name: "ユーザーB",
        commonAuthorCount: "3",
        commonAuthorNames: "著者A|著者B|著者C",
      },
    ]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([
      {
        userId: 2,
        name: "ユーザーB",
        commonAuthorCount: 3,
        commonAuthorNames: ["著者A", "著者B", "著者C"],
      },
    ]);
  });

  it("commonAuthorCountが数値のまま返る場合はそのまま返す", async () => {
    mockQueryRaw.mockResolvedValue([
      { userId: 3, name: "ユーザーC", commonAuthorCount: 1, commonAuthorNames: "著者A" },
    ]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([
      { userId: 3, name: "ユーザーC", commonAuthorCount: 1, commonAuthorNames: ["著者A"] },
    ]);
  });

  it("共通著者名は表示上限（3件）までに絞り込むが、commonAuthorCountは全体件数を保持する", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        userId: 4,
        name: "ユーザーD",
        commonAuthorCount: "5",
        commonAuthorNames: "著者A|著者B|著者C|著者D|著者E",
      },
    ]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([
      {
        userId: 4,
        name: "ユーザーD",
        commonAuthorCount: 5,
        commonAuthorNames: ["著者A", "著者B", "著者C"],
      },
    ]);
  });

  it("候補がない場合は空配列を返す", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([]);
  });

  it("commonAuthorNamesがnullの場合は空配列を返す", async () => {
    mockQueryRaw.mockResolvedValue([
      { userId: 5, name: "ユーザーE", commonAuthorCount: 0, commonAuthorNames: null },
    ]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([
      { userId: 5, name: "ユーザーE", commonAuthorCount: 0, commonAuthorNames: [] },
    ]);
  });

  it("$queryRaw に userId と limit を埋め込んで呼び出す", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getRecommendedUsers(99, 3);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // タグ付きテンプレートの呼び出しは (strings, ...values) の形になる。
    // クエリ内で ${userId} が4箇所（my_authors, already_following,
    // candidates内で2箇所）、${limit} が末尾に1箇所埋め込まれている。
    const [, ...values] = mockQueryRaw.mock.calls[0];
    expect(values).toEqual([99, 99, 99, 99, 3]);
  });
});
