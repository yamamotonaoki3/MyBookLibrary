import { chunk, flatMapInChunks, insertInChunks, rowsPerInsert, sumInChunks, uniqueBy } from "@/lib/chunk";

describe("chunk", () => {
  it("指定の件数ごとに分ける", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("空なら何も返さない", () => {
    expect(chunk([], 2)).toEqual([]);
  });
  it("既定では 50 件ずつに分ける", () => {
    expect(chunk(Array.from({ length: 120 }, (_, i) => i)).map((c) => c.length)).toEqual([50, 50, 20]);
  });
  it("件数が 1 以上の整数でなければ拒否する", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe("flatMapInChunks / sumInChunks", () => {
  it("分割した問い合わせの結果を順にまとめる", async () => {
    const query = jest.fn(async (part: number[]) => part.map((n) => n * 10));
    expect(await flatMapInChunks([1, 2, 3], query, 2)).toEqual([10, 20, 30]);
    expect(query.mock.calls).toEqual([[[1, 2]], [[3]]]);
  });
  it("値が空なら問い合わせない", async () => {
    const query = jest.fn(async () => [1]);
    expect(await flatMapInChunks([], query)).toEqual([]);
    expect(await sumInChunks([], async () => 1)).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
  it("件数を合計する", async () => {
    expect(await sumInChunks([1, 2, 3, 4, 5], async (part) => part.length, 2)).toBe(5);
  });
});

describe("insertInChunks / rowsPerInsert", () => {
  it("1 行あたりの列数から、100 個を超えない行数を求める", () => {
    expect(rowsPerInsert(10)).toBe(9);
    expect(rowsPerInsert(1)).toBe(90);
    expect(rowsPerInsert(500)).toBe(1);
  });
  it("行を分割して登録し、件数を合計する", async () => {
    const insert = jest.fn(async (rows: number[]) => ({ count: rows.length }));
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(await insertInChunks(rows, 10, insert)).toBe(25);
    expect(insert.mock.calls.map(([part]) => part.length)).toEqual([9, 9, 7]);
  });
});

describe("uniqueBy", () => {
  it("同じキーの行は最初の 1 つだけ残す", () => {
    expect(uniqueBy([{ id: 1, v: "a" }, { id: 2, v: "b" }, { id: 1, v: "c" }], (r) => r.id)).toEqual([
      { id: 1, v: "a" },
      { id: 2, v: "b" },
    ]);
  });
});
