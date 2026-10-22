jest.mock("@/lib/prisma");
import { prismaMock } from "../../helpers/prismaMock";
import { findReviewBooks } from "@/repositories/bookReviewRepository";
beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.book.findMany.mockResolvedValue([]);
  prismaMock.bookIsbn.findMany.mockResolvedValue([]);
  prismaMock.author.findMany.mockResolvedValue([]);
});
test("external lookups never load the author catalog", async () => {
  await findReviewBooks([{ isbn: "9784000000001", title: "本", author: "著者" }]);
  expect(prismaMock.author.findMany).not.toHaveBeenCalled();
});

test("a secondary ISBN match avoids title-author fallback", async () => {
  prismaMock.book.findMany.mockResolvedValueOnce([
    { id: 1, title: "保存済みの本", isbn: "9784000000002", author: { name: "保存済みの著者" } } as never,
  ]);
  prismaMock.bookIsbn.findMany.mockResolvedValueOnce([
    { bookId: 1, isbn: "9784000000001" } as never,
  ]);
  const books = await findReviewBooks([
    { isbn: "9784000000001", title: "外部の本", author: "外部の著者" },
  ]);
  expect(prismaMock.book.findMany).toHaveBeenCalledTimes(1);
  expect(prismaMock.author.findMany).not.toHaveBeenCalled();
  expect(books).toEqual([
    { id: 1, title: "保存済みの本", isbn: "9784000000002", author: { name: "保存済みの著者" },
      bookIsbns: [{ isbn: "9784000000001" }] },
  ]);
});
