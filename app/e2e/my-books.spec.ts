import { test, expect } from "@playwright/test";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function seedBooksWithStatuses() {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "私の本一覧著者" } });

  const wantToRead = await testPrisma.book.create({
    data: { title: "読みたい本テスト", authorId: author.id, publishedAt: new Date("2020-01-01") },
  });
  const reading = await testPrisma.book.create({
    data: { title: "読書中の本テスト", authorId: author.id, publishedAt: new Date("2020-01-01") },
  });
  const read = await testPrisma.book.create({
    data: { title: "読了済みの本テスト", authorId: author.id, publishedAt: new Date("2020-01-01") },
  });

  await testPrisma.readingStatus.create({ data: { userId: me.id, bookId: wantToRead.id, status: "want_to_read" } });
  await testPrisma.readingStatus.create({ data: { userId: me.id, bookId: reading.id, status: "reading" } });
  await testPrisma.readingStatus.create({ data: { userId: me.id, bookId: read.id, status: "read" } });

  return { me, author, wantToRead, reading, read };
}

test("読書ステータスごとの件数サマリーが正しく表示される", async ({ page }) => {
  await seedBooksWithStatuses();
  await login(page);
  await page.goto("/books");

  await expect(page.getByRole("heading", { name: "私の本一覧" })).toBeVisible();
  const summary = page.locator("div.grid.grid-cols-3");
  await expect(summary.getByText("1", { exact: true }).nth(0)).toBeVisible();
});

test("ステータスで絞り込むと該当ステータスの本のみ表示される", async ({ page }) => {
  const { wantToRead, reading, read } = await seedBooksWithStatuses();
  await login(page);
  await page.goto("/books?status=reading");

  await expect(
    page.getByRole("link", { name: reading.title, exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: wantToRead.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: read.title, exact: true })).toHaveCount(0);
});

test("著者で絞り込むと該当著者の本のみ表示される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const favoriteAuthor = await testPrisma.author.create({ data: { name: "絞り込み対象著者" } });
  const otherAuthor = await testPrisma.author.create({ data: { name: "対象外著者" } });
  await testPrisma.favoriteAuthor.create({ data: { userId: me.id, authorId: favoriteAuthor.id } });

  const targetBook = await testPrisma.book.create({
    data: { title: "絞り込み対象の本", authorId: favoriteAuthor.id, publishedAt: new Date("2020-01-01") },
  });
  const otherBook = await testPrisma.book.create({
    data: { title: "絞り込み対象外の本", authorId: otherAuthor.id, publishedAt: new Date("2020-01-01") },
  });
  await testPrisma.readingStatus.create({ data: { userId: me.id, bookId: targetBook.id, status: "want_to_read" } });
  await testPrisma.readingStatus.create({ data: { userId: me.id, bookId: otherBook.id, status: "want_to_read" } });

  await login(page);
  await page.goto(`/books?author=${favoriteAuthor.id}`);

  await expect(
    page.getByRole("link", { name: "絞り込み対象の本", exact: true }).locator("visible=true")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "絞り込み対象外の本", exact: true })).toHaveCount(0);
});

test("一覧のカードからステータスを変更すると、サマリー件数・表示が更新される", async ({ page }) => {
  const { me, wantToRead } = await seedBooksWithStatuses();
  await login(page);
  await page.goto("/books");

  const card = page
    .getByRole("link", { name: wantToRead.title, exact: true })
    .locator("visible=true")
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/reading-status") && res.request().method() === "POST"),
    card.getByRole("button", { name: "読了" }).click(),
  ]);

  await expect(card.getByRole("button", { name: "読了" })).toHaveClass(/bg-green-600/);

  const status = await testPrisma.readingStatus.findFirstOrThrow({
    where: { userId: me.id, bookId: wantToRead.id },
  });
  expect(status.status).toBe("read");
});

test("一覧の本カードをクリックして本の詳細ページへ遷移できる", async ({ page }) => {
  const { wantToRead } = await seedBooksWithStatuses();
  await login(page);
  await page.goto("/books");

  await page.getByRole("link", { name: wantToRead.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${wantToRead.id}$`));
});

test("感想を投稿済みの本にはカード上に感想ありの表示が出る", async ({ page }) => {
  const { me, read } = await seedBooksWithStatuses();
  await testPrisma.review.create({
    data: { userId: me.id, bookId: read.id, body: "感想テスト本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  await page.goto("/books");

  const card = page
    .getByRole("link", { name: read.title, exact: true })
    .locator("visible=true")
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(card.getByText("感想投稿済み")).toBeVisible();
});

test("1件も本を登録していない場合、該当する本がありませんと表示される", async ({ page }) => {
  await login(page);
  await page.goto("/books");

  await expect(page.getByText("該当する本がありません。").locator("visible=true")).toBeVisible();
});
