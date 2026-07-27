const mockQueryRaw = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import { Prisma } from "@/generated/prisma";
import { getRecommendedAuthors } from "@/lib/recommendations";

describe("getRecommendedAuthors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("MySQLのDECIMAL演算結果が文字列で返っても数値に変換する", async () => {
    mockQueryRaw.mockResolvedValue([
      { authorId: 2, name: "著者B", score: "0.5000" },
      { authorId: 3, name: "著者C", score: "0.3333" },
    ]);

    const result = await getRecommendedAuthors(1);

    expect(result).toEqual([
      { authorId: 2, name: "著者B", score: 0.5 },
      { authorId: 3, name: "著者C", score: 0.3333 },
    ]);
  });

  it("MySQLのDECIMAL演算結果がPrisma.Decimalで返っても数値に変換する", async () => {
    mockQueryRaw.mockResolvedValue([
      { authorId: 4, name: "著者D", score: new Prisma.Decimal("0.25") },
    ]);

    const result = await getRecommendedAuthors(1);

    expect(result).toEqual([{ authorId: 4, name: "著者D", score: 0.25 }]);
  });

  it("score が数値のまま返る場合はそのまま返す", async () => {
    mockQueryRaw.mockResolvedValue([{ authorId: 5, name: "著者E", score: 1 }]);

    const result = await getRecommendedAuthors(1);

    expect(result).toEqual([{ authorId: 5, name: "著者E", score: 1 }]);
  });

  it("候補がない場合は空配列を返す", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await getRecommendedAuthors(1);

    expect(result).toEqual([]);
  });

  it("$queryRaw に userId と limit を埋め込んで呼び出す", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await getRecommendedAuthors(99, 3);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // タグ付きテンプレートの呼び出しは (strings, ...values) の形になる。
    // クエリ内で ${userId} が2箇所、${limit} が末尾に1箇所埋め込まれている。
    const [, ...values] = mockQueryRaw.mock.calls[0];
    expect(values).toEqual([99, 99, 3]);
  });
});
