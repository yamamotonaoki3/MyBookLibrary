import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { E2E_USER, seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

// #612 で削除した未使用 API（awards/progress・reviews/stats・follows/recommendations）が
// 担っていた表示が、Server Component から引き続き取得できることを検証する。

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function createOtherUser(name: string, email: string) {
  const passwordHash = await bcrypt.hash("OtherUserPass123!", 12);
  return testPrisma.user.create({
    data: { name, email, password: passwordHash, role: "user" },
  });
}

test("ダッシュボードに賞ごとの読書進捗と受領いいね数が表示される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "進捗確認著者" } });
  const award = await testPrisma.award.create({ data: { name: "進捗確認賞" } });
  const readBook = await testPrisma.book.create({
    data: { title: "進捗確認の読了本", authorId: author.id, isbn: "9780000000611", publishedAt: new Date("2023-01-01") },
  });
  const unreadBook = await testPrisma.book.create({
    data: { title: "進捗確認の未読本", authorId: author.id, isbn: "9780000000612", publishedAt: new Date("2023-01-01") },
  });
  await testPrisma.awardEntry.createMany({
    data: [
      { bookId: readBook.id, awardId: award.id, year: 2023, type: "winner" },
      { bookId: unreadBook.id, awardId: award.id, year: 2023, type: "nominee" },
    ],
  });
  await testPrisma.readingStatus.create({
    data: { userId: me.id, bookId: readBook.id, status: "read" },
  });

  // 自分のレビューに他ユーザー2人がいいねしている → 受領いいね数 2
  const review = await testPrisma.review.create({
    data: { userId: me.id, bookId: readBook.id, body: "いいね数確認用の感想です。", isPublic: true },
  });
  const liker1 = await createOtherUser("いいね元A", "e2e-liker-a@example.com");
  const liker2 = await createOtherUser("いいね元B", "e2e-liker-b@example.com");
  await testPrisma.like.createMany({
    data: [
      { userId: liker1.id, reviewId: review.id },
      { userId: liker2.id, reviewId: review.id },
    ],
  });

  await login(page);
  await page.goto("/");

  await expect(page.getByText("進捗確認賞").locator("visible=true").first()).toBeVisible();
  await expect(page.getByText("1 / 2冊 · 50%").locator("visible=true").first()).toBeVisible();
  const likes = page.getByText("いいね数", { exact: true }).locator("visible=true").first();
  await expect(likes).toBeVisible();
  await expect(likes.locator("xpath=following-sibling::p[1]")).toContainText("2");
});

test("フォロー管理の「おすすめ」タブに、共通のお気に入り著者を持つユーザーが表示される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const sharedAuthor = await testPrisma.author.create({ data: { name: "共通お気に入り著者" } });
  const other = await createOtherUser("おすすめ候補ユーザー", "e2e-recommend@example.com");
  await testPrisma.favoriteAuthor.createMany({
    data: [
      { userId: me.id, authorId: sharedAuthor.id },
      { userId: other.id, authorId: sharedAuthor.id },
    ],
  });

  await login(page);
  await page.goto("/settings/follows");
  await page.getByRole("tab", { name: /おすすめ/ }).click();

  const item = page.getByRole("listitem").filter({ hasText: other.name }).locator("visible=true");
  await expect(item).toBeVisible();
  await expect(item.getByText("共通お気に入り著者")).toBeVisible();
});
