import {
  computeBackfillCandidates,
  filterApprovedUpdates,
  parseApprovedEntries,
} from "@/lib/migration/backfillBookOwner";

describe("computeBackfillCandidates", () => {
  it("最古のReadingStatus（idが最小）のuserIdを推定値とする", () => {
    const result = computeBackfillCandidates([
      {
        bookId: 1,
        readingStatuses: [
          { id: 30, userId: 999 },
          { id: 10, userId: 111 },
          { id: 20, userId: 222 },
        ],
      },
    ]);

    expect(result).toEqual([{ bookId: 1, estimatedUserId: 111 }]);
  });

  it("ReadingStatusが1件も無い書籍はestimatedUserId=nullとする（推定不能）", () => {
    const result = computeBackfillCandidates([{ bookId: 2, readingStatuses: [] }]);
    expect(result).toEqual([{ bookId: 2, estimatedUserId: null }]);
  });

  it("複数書籍をまとめて処理できる", () => {
    const result = computeBackfillCandidates([
      { bookId: 1, readingStatuses: [{ id: 5, userId: 1 }] },
      { bookId: 2, readingStatuses: [] },
      {
        bookId: 3,
        readingStatuses: [
          { id: 8, userId: 3 },
          { id: 7, userId: 4 },
        ],
      },
    ]);

    expect(result).toEqual([
      { bookId: 1, estimatedUserId: 1 },
      { bookId: 2, estimatedUserId: null },
      { bookId: 3, estimatedUserId: 4 },
    ]);
  });
});

describe("filterApprovedUpdates", () => {
  const candidates = [
    { bookId: 1, estimatedUserId: 111 },
    { bookId: 2, estimatedUserId: null },
    { bookId: 3, estimatedUserId: 333 },
  ];

  it("承認ファイルに含まれるbookIdのみを更新対象とする", () => {
    const result = filterApprovedUpdates(candidates, [
      { bookId: 1, userId: 111 },
      { bookId: 3, userId: 333 },
    ]);

    expect(result).toEqual([
      { bookId: 1, userId: 111 },
      { bookId: 3, userId: 333 },
    ]);
  });

  it("dry-runの候補に存在しないbookIdは承認ファイルにあっても除外する", () => {
    const result = filterApprovedUpdates(candidates, [{ bookId: 999, userId: 1 }]);
    expect(result).toEqual([]);
  });

  it("推定不能な候補は承認ファイルにあっても除外する", () => {
    const result = filterApprovedUpdates(candidates, [{ bookId: 2, userId: 222 }]);
    expect(result).toEqual([]);
  });

  it("承認ファイルが空なら更新対象も空になる", () => {
    expect(filterApprovedUpdates(candidates, [])).toEqual([]);
  });

  it("承認ファイルのuserIdをそのまま更新値として使う（dry-runの推定値は参照しない）", () => {
    // 人手承認の過程で推定値と異なるuserIdへ訂正された場合、承認ファイルの値を優先する。
    const result = filterApprovedUpdates(candidates, [{ bookId: 1, userId: 999 }]);
    expect(result).toEqual([{ bookId: 1, userId: 999 }]);
  });
});

describe("parseApprovedEntries", () => {
  it("正しい形式（bookId・userIdを持つオブジェクトの配列）をそのまま返す", () => {
    const result = parseApprovedEntries([
      { bookId: 1, userId: 5 },
      { bookId: 2, userId: 6 },
    ]);
    expect(result).toEqual([
      { bookId: 1, userId: 5 },
      { bookId: 2, userId: 6 },
    ]);
  });

  it("空配列は空配列のまま返す", () => {
    expect(parseApprovedEntries([])).toEqual([]);
  });

  it("トップレベルが配列でなければエラーを投げる", () => {
    expect(() => parseApprovedEntries({ bookId: 1, userId: 5 })).toThrow(/配列/);
    expect(() => parseApprovedEntries(null)).toThrow(/配列/);
    expect(() => parseApprovedEntries("not-an-array")).toThrow(/配列/);
  });

  it("要素がオブジェクトでなければエラーを投げる", () => {
    expect(() => parseApprovedEntries([1, 2, 3])).toThrow(/不正です/);
    expect(() => parseApprovedEntries([null])).toThrow(/不正です/);
  });

  it("dry-run候補ファイル（estimatedUserId形式）をそのまま渡すとエラーになる", () => {
    // candidates.jsonをそのままapproved.jsonとして渡してしまう典型的な誤操作を想定。
    expect(() =>
      parseApprovedEntries([{ bookId: 1, estimatedUserId: 5 }])
    ).toThrow(/"bookId"と"userId"/);
  });

  it("bookIdが整数でなければエラーを投げる", () => {
    expect(() => parseApprovedEntries([{ bookId: "1", userId: 5 }])).toThrow(/bookId/);
    expect(() => parseApprovedEntries([{ bookId: 1.5, userId: 5 }])).toThrow(/bookId/);
  });

  it("userIdが整数でなければエラーを投げる", () => {
    expect(() => parseApprovedEntries([{ bookId: 1, userId: null }])).toThrow(/userId/);
    expect(() => parseApprovedEntries([{ bookId: 1, userId: "5" }])).toThrow(/userId/);
  });
});
