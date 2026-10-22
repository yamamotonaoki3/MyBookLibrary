jest.mock("@/repositories/bookReviewRepository", () => ({
  findPublicReviewCounts: jest.fn(),
  findReviewBooks: jest.fn(),
}));
import { findPublicReviewCounts, findReviewBooks } from "@/repositories/bookReviewRepository";
import { getPublicReviewCounts, withPublicReviewCounts } from "@/lib/bookReviewSummary";
const counts = jest.mocked(findPublicReviewCounts);
const books = jest.mocked(findReviewBooks);

beforeEach(() => { jest.resetAllMocks(); counts.mockResolvedValue([]); books.mockResolvedValue([]); });
test("empty inputs do not query the database", async () => {
  expect(await getPublicReviewCounts([])).toEqual(new Map());
  expect(await withPublicReviewCounts([])).toEqual([]);
  expect(counts).not.toHaveBeenCalled(); expect(books).not.toHaveBeenCalled();
});
test("deduplicates book IDs and fills missing counts with zero", async () => {
  counts.mockResolvedValue([{ bookId: 1, _count: { _all: 2 } }]);
  expect(await getPublicReviewCounts([1, 2, 1])).toEqual(new Map([[1, 2], [2, 0]]));
  expect(counts).toHaveBeenCalledWith([1, 2]);
});
test("secondary ISBN resolves the same Book, while same title by another author does not", async () => {
  books.mockResolvedValue([{ id: 1, title: "本", isbn: "9784101010014", author: { name: "著者 A" }, bookIsbns: [{ isbn: "9784000000001" }] }]);
  counts.mockResolvedValue([{ bookId: 1, _count: { _all: 3 } }]);
  const items = await withPublicReviewCounts([
    { title: "別版名", author: "外部表記", isbn: "9784000000001" },
    { title: "本", author: "著者 B", isbn: null },
    { title: " 本 ", author: "著者Ａ", isbn: null },
    { title: "本", author: "著者 A", isbn: null },
    { title: "未登録", author: "著者 A", isbn: null },
  ]);
  expect(items.map(i => i.publicReviewCount)).toEqual([3, 0, 0, 3, 0]);
});
test("ambiguous title and author never borrow a count from a different Book", async () => {
  books.mockResolvedValue([1, 2].map(id => ({ id, title: "本", isbn: null, author: { name: "著者" }, bookIsbns: [] })));
  expect((await withPublicReviewCounts([{ title: "本", author: "著者", isbn: null }]))[0].publicReviewCount).toBe(0);
});
test("database failures propagate instead of appearing as zero reviews", async () => {
  counts.mockRejectedValue(new Error("unavailable"));
  await expect(getPublicReviewCounts([1])).rejects.toThrow("unavailable");
});
