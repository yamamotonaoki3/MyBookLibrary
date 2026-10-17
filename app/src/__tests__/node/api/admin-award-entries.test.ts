jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asAdmin, asForbidden } from "../../helpers/sessionMock";
import { IN_CLAUSE_CHUNK_SIZE } from "@/lib/chunk";

// D1 は 1 クエリの変数が 100 個まで。本の ISBN は、本 ID を分けて取る（#744）。
const D1_MAX_VARIABLES = 100;

const makeEntries = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    bookId: 1000 + i,
    awardId: 1,
    year: 2020,
    type: "nominee",
    book: { id: 1000 + i, title: `テスト作品${i}`, author: { id: 1, name: "架空 太郎" } },
    award: { id: 1, name: "架空文学賞" },
  }));

describe("GET /api/admin/award-entries", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/award-entries/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    asAdmin(99);
  });

  it("管理者でない → 403、何も読まない", async () => {
    asForbidden();
    expect((await GET()).status).toBe(403);
    expect(prismaMock.awardEntry.findMany).not.toHaveBeenCalled();
  });

  it("受賞登録が 100 件を超えても、ISBN を 1 回あたり上限以内に分けて取り、本ごとにまとめる", async () => {
    prismaMock.awardEntry.findMany.mockResolvedValue(makeEntries(260) as never);
    prismaMock.bookIsbn.findMany.mockImplementation((async (args: { where: { bookId: { in: number[] } } }) =>
      args.where.bookId.in
        // 偶数番目の本だけ、ISBN を 2 件持つ（主 ISBN が先）
        .filter((bookId) => bookId % 2 === 0)
        .flatMap((bookId) => [
          { id: bookId * 10, bookId, isbn: `a${bookId}`, isPrimary: true },
          { id: bookId * 10 + 1, bookId, isbn: `b${bookId}`, isPrimary: false },
        ])) as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(260);

    // どの問い合わせも、本 ID が上限以内（変数の上限 100 個を超えない）
    const calls = prismaMock.bookIsbn.findMany.mock.calls;
    expect(calls.length).toBe(Math.ceil(260 / IN_CLAUSE_CHUNK_SIZE));
    for (const [args] of calls) {
      expect((args as { where: { bookId: { in: number[] } } }).where.bookId.in.length).toBeLessThanOrEqual(
        IN_CLAUSE_CHUNK_SIZE
      );
      expect(IN_CLAUSE_CHUNK_SIZE).toBeLessThan(D1_MAX_VARIABLES);
    }

    // 応答の形は、include のときと同じ（book.bookIsbns。ない本は空配列）
    expect(json[0].book.bookIsbns.map((i: { isbn: string }) => i.isbn)).toEqual(["a1000", "b1000"]);
    expect(json[1].book.bookIsbns).toEqual([]);
    expect(json[0].book.author.name).toBe("架空 太郎");
    expect(json[0].award.name).toBe("架空文学賞");
  });

  it("同じ本が複数の賞に入っていても、ISBN を重複して取らない", async () => {
    const [a, b] = makeEntries(2);
    prismaMock.awardEntry.findMany.mockResolvedValue([a, { ...b, bookId: a.bookId, book: a.book }] as never);
    prismaMock.bookIsbn.findMany.mockResolvedValue([] as never);

    await GET();

    const ids = (prismaMock.bookIsbn.findMany.mock.calls[0][0] as { where: { bookId: { in: number[] } } }).where.bookId.in;
    expect(ids).toEqual([a.bookId]);
  });

  it("受賞登録が 0 件なら、ISBN を問い合わせない", async () => {
    prismaMock.awardEntry.findMany.mockResolvedValue([] as never);
    const res = await GET();
    expect(await res.json()).toEqual([]);
    expect(prismaMock.bookIsbn.findMany).not.toHaveBeenCalled();
  });

  it("読み込みに失敗したら 500", async () => {
    prismaMock.awardEntry.findMany.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
  });
});
