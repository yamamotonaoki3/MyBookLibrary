jest.mock("@/lib/prisma");

import { getRecommendedUsers } from "@/lib/userRecommendations";
import { prismaMock } from "../../helpers/prismaMock";

const mockQueryRaw = prismaMock.$queryRaw;

/** 共通著者名の取得（favoriteAuthor.findMany）の戻り値を作る。 */
function commonRows(userId: number, names: string[]) {
  return names.map((name) => ({ userId, author: { name } }));
}

describe("getRecommendedUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.favoriteAuthor.findMany.mockResolvedValue([]);
  });

  it("COUNT(DISTINCT)の結果が文字列で返っても数値に変換する", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 2, name: "ユーザーB", commonAuthorCount: "3" }]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue(commonRows(2, ["著者A", "著者B", "著者C"]));

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

  it("COUNT(DISTINCT)の結果が bigint で返っても数値に変換する", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 2, name: "ユーザーB", commonAuthorCount: BigInt(2) }]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue(commonRows(2, ["著者A", "著者B"]));

    const result = await getRecommendedUsers(1);

    expect(result[0].commonAuthorCount).toBe(2);
  });

  it("commonAuthorCountが数値のまま返る場合はそのまま返す", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 3, name: "ユーザーC", commonAuthorCount: 1 }]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue(commonRows(3, ["著者A"]));

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([
      { userId: 3, name: "ユーザーC", commonAuthorCount: 1, commonAuthorNames: ["著者A"] },
    ]);
  });

  it("共通著者名は表示上限（3件）までに絞り込むが、commonAuthorCountは全体件数を保持する", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 4, name: "ユーザーD", commonAuthorCount: "5" }]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue(
      commonRows(4, ["著者A", "著者B", "著者C", "著者D", "著者E"])
    );

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

  it("複数ユーザーの共通著者名を、それぞれのユーザーに振り分ける", async () => {
    mockQueryRaw.mockResolvedValue([
      { userId: 2, name: "ユーザーB", commonAuthorCount: 2 },
      { userId: 3, name: "ユーザーC", commonAuthorCount: 1 },
    ]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue([
      ...commonRows(2, ["著者A"]),
      ...commonRows(3, ["著者B"]),
      ...commonRows(2, ["著者C"]),
    ]);

    const result = await getRecommendedUsers(1);

    expect(result.map((r) => [r.userId, r.commonAuthorNames])).toEqual([
      [2, ["著者A", "著者C"]],
      [3, ["著者B"]],
    ]);
  });

  it("同名の別著者は共通著者名で 1 つにまとめ、上限（3件）に重複で押し出されない", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 2, name: "ユーザーB", commonAuthorCount: 4 }]);
    prismaMock.favoriteAuthor.findMany.mockResolvedValue(
      commonRows(2, ["著者A", "著者A", "著者B", "著者C"])
    );

    const result = await getRecommendedUsers(1);

    expect(result[0].commonAuthorNames).toEqual(["著者A", "著者B", "著者C"]);
  });

  it("候補がない場合は空配列を返し、共通著者名の取得は行わない", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getRecommendedUsers(1);

    expect(result).toEqual([]);
    expect(prismaMock.favoriteAuthor.findMany).not.toHaveBeenCalled();
  });

  it("共通著者名が取得できなかったユーザーは空配列を返す", async () => {
    mockQueryRaw.mockResolvedValue([{ userId: 5, name: "ユーザーE", commonAuthorCount: 0 }]);

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

  it("生 SQL に MySQL 固有の GROUP_CONCAT を使わない", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getRecommendedUsers(1);

    const [strings] = mockQueryRaw.mock.calls[0] as [readonly string[]];
    expect(strings.join("")).not.toMatch(/GROUP_CONCAT|SEPARATOR/i);
  });
});
