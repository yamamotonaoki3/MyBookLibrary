import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

// スタブ楽天API（e2e/fixtures/external/rakuten-search.json）は常に
// ISBN 9784101010014「吾輩は猫である」（夏目漱石）を返す固定フィクスチャ。
const STUB_ISBN = "9784101010014";
const STUB_TITLE = "吾輩は猫である";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

test("DBに無いISBNへ直接アクセスすると、楽天スタブ経由で自動登録され本詳細へ遷移する", async ({
  page,
}) => {
  const before = await testPrisma.book.count({ where: { isbn: STUB_ISBN } });
  expect(before).toBe(0);

  await login(page);
  await page.goto(`/books/isbn/${STUB_ISBN}`);
  await page.waitForURL(/\/books\/\d+$/);
  await expect(page.getByRole("heading", { name: STUB_TITLE })).toBeVisible();

  const after = await testPrisma.book.findMany({ where: { isbn: STUB_ISBN } });
  expect(after).toHaveLength(1);
});

test("既にDBにある本のISBNへアクセスすると、重複登録されず既存の本詳細へリダイレクトされる", async ({
  page,
}) => {
  const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
  const existing = await testPrisma.book.create({
    data: {
      title: STUB_TITLE,
      authorId: author.id,
      isbn: STUB_ISBN,
      publishedAt: new Date("1990-04-01"),
    },
  });

  await login(page);
  await page.goto(`/books/isbn/${STUB_ISBN}`);
  await expect(page).toHaveURL(new RegExp(`/books/${existing.id}$`));
  await expect(page.getByRole("heading", { name: STUB_TITLE })).toBeVisible();

  const count = await testPrisma.book.count({ where: { isbn: STUB_ISBN } });
  expect(count).toBe(1);
});

test("手動登録（source=manual）で既存ISBNを登録すると、新しい本として重複登録されず既存本にステータスが追加される", async ({
  page,
}) => {
  // 「手動で登録する」ボタンは検索結果0件のときのみ表示されるが、スタブ楽天API
  // （e2e/fixtures/external/rakuten-search.json）はクエリを無視して常に1件返す
  // 固定フィクスチャのため、UI操作だけでは0件状態を再現できない
  // （e2e/stub-server.ts のコメント参照）。ここでは実際にログイン中のブラウザ
  // セッションから、手動登録モーダルと同じAPI呼び出しを直接行い、
  // サーバー側の重複防止ロジックを検証する。
  const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
  const existing = await testPrisma.book.create({
    data: {
      title: STUB_TITLE,
      authorId: author.id,
      isbn: STUB_ISBN,
      publishedAt: new Date("1990-04-01"),
    },
  });

  await login(page);
  const res = await page.request.post("/api/reading-status", {
    data: {
      title: STUB_TITLE,
      author: "夏目漱石",
      status: "want_to_read",
      source: "manual",
      isbn: STUB_ISBN,
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.bookId).toBe(existing.id);

  const books = await testPrisma.book.findMany({ where: { isbn: STUB_ISBN } });
  expect(books).toHaveLength(1);

  const statuses = await testPrisma.readingStatus.findMany({ where: { bookId: existing.id } });
  expect(statuses).toHaveLength(1);
  expect(statuses[0].status).toBe("want_to_read");
});
