import { testPrisma, resetDb } from "../helpers/dbTest";
import { prisma } from "@/lib/prisma";
import { insertInChunks } from "@/lib/chunk";
import { getPublicReviewCounts, withPublicReviewCounts } from "@/lib/bookReviewSummary";

beforeEach(resetDb);
afterAll(async () => { await testPrisma.$disconnect(); await prisma.$disconnect(); });
test("ISBN fallback uses exact title and author without normalizing different input", async () => {
  const user = await testPrisma.user.create({ data: { email: "testuser_normalized@example.com", name: "正規化テスト" } });
  const author = await testPrisma.author.create({ data: { name: "著者 Ａ" } });
  const book = await testPrisma.book.create({ data: { authorId: author.id, title: "吾 輩のＢＯＯＫ", publishedAt: new Date("2026-01-01") } });
  await testPrisma.review.create({ data: { userId: user.id, bookId: book.id, body: "[E2E_TEST] 正規化照合の公開レビュー", isPublic: true } });
  const results = await withPublicReviewCounts([{ title: " 吾輩のBOOK ", author: "著者A", isbn: null }]);
  expect(results[0].publicReviewCount).toBe(0);
  expect((await withPublicReviewCounts([{ title: book.title, author: author.name, isbn: null }]))[0].publicReviewCount).toBe(1);
  await testPrisma.bookIsbn.create({ data: { bookId: book.id, isbn: "9784000000001", isPrimary: false } });
  expect((await withPublicReviewCounts([{ title: "別の版の表記", author: "外部著者表記", isbn: "9784000000001" }]))[0].publicReviewCount).toBe(1);
  const another = await testPrisma.author.create({ data: { name: "別著者" } });
  await testPrisma.book.create({ data: { authorId: another.id, title: "吾輩のBOOK", publishedAt: new Date("2026-01-01") } });
  expect((await withPublicReviewCounts([{ title: "吾輩のBOOK", author: "別著者", isbn: null }]))[0].publicReviewCount).toBe(0);
});
test("151 books: public records only, duplicate IDs, secondary ISBN and updates", async () => {
  const me = await testPrisma.user.create({ data: { email: "testuser_counts@example.com", name: "件数テスト" } });
  const other = await testPrisma.user.create({ data: { email: "testuser_counts_other@example.com", name: "別ユーザー" } });
  const author = await testPrisma.author.create({ data: { name: "[E2E_TEST] 件数著者" } });
  await insertInChunks(Array.from({ length: 151 }, (_, i) => ({ title: `[E2E_TEST] 本${i}`, authorId: author.id, publishedAt: new Date("2026-01-01") })), 12,
    data => testPrisma.book.createMany({ data }));
  const books = await testPrisma.book.findMany({ orderBy: { id: "asc" } });
  await insertInChunks(books.flatMap(book => [
    { userId: me.id, bookId: book.id, body: "公開レビューの本文です。", isPublic: true, isSpoiler: false },
    { userId: me.id, bookId: book.id, body: "公開ネタバレレビューです。", isPublic: true, isSpoiler: true },
    { userId: me.id, bookId: book.id, body: "本人の非公開レビューです。", isPublic: false, isSpoiler: false },
    { userId: other.id, bookId: book.id, body: "他人の非公開レビューです。", isPublic: false, isSpoiler: false },
  ]), 10, data => testPrisma.review.createMany({ data }));
  const ids = books.map(book => book.id);
  const result = await getPublicReviewCounts([...ids, ...ids]);
  expect(result.size).toBe(151);
  expect([...result.values()]).toEqual(Array(151).fill(2));
  const isbn = "9784000000001";
  await testPrisma.bookIsbn.create({ data: { bookId: books[0].id, isbn, isPrimary: false } });
  const before = await testPrisma.book.count();
  const external = await withPublicReviewCounts([
    { title: "別版", author: "外部表記", isbn },
    { title: "未登録", author: "別の著者", isbn: "9784000000002" },
  ]);
  expect(external.map(item => item.publicReviewCount)).toEqual([2, 0]);
  expect(await testPrisma.book.count()).toBe(before);
  await testPrisma.review.updateMany({ where: { bookId: books[0].id }, data: { isPublic: false } });
  expect((await getPublicReviewCounts(ids)).get(books[0].id)).toBe(0);
  await testPrisma.review.deleteMany({ where: { bookId: books[1].id } });
  expect((await getPublicReviewCounts(ids)).get(books[1].id)).toBe(0);
});
