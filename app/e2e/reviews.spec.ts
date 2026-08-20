import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function createOtherUser() {
  const passwordHash = await bcrypt.hash("OtherUserPass123!", 12);
  return testPrisma.user.create({
    data: {
      name: "レビュー相手",
      email: "e2e-review-other@example.com",
      password: passwordHash,
      role: "user",
    },
  });
}

async function seedBook(title = "レビュー対象本") {
  const author = await testPrisma.author.create({ data: { name: "レビュー対象著者" } });
  return testPrisma.book.create({
    data: { title, authorId: author.id, publishedAt: new Date("2020-01-01") },
  });
}

test("感想投稿時にネタバレ・公開範囲を設定でき、表示に反映される", async ({ page }) => {
  const book = await seedBook();
  await login(page);
  await page.goto(`/books/${book.id}/reviews/new`);

  await page.getByLabel("感想").fill("ネタバレを含む非公開の感想テストです。");
  await page.getByText("ネタバレを含む", { exact: true }).click();
  await page.getByText("全体に公開する", { exact: true }).click();
  await page.getByRole("button", { name: "投稿する" }).click();

  await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`));
  await expect(page.getByText("ネタバレあり")).toBeVisible();
  await expect(page.getByText("ネタバレを含む非公開の感想テストです。")).toBeVisible();

  const review = await testPrisma.review.findFirstOrThrow({ where: { bookId: book.id } });
  expect(review.isSpoiler).toBe(true);
  expect(review.isPublic).toBe(false);
});

test("空・10文字未満の感想は投稿ボタンが無効化されAPIが呼ばれない", async ({ page }) => {
  const book = await seedBook();
  let called = false;
  await page.route("**/api/reviews", async (route) => {
    called = true;
    await route.continue();
  });

  await login(page);
  await page.goto(`/books/${book.id}/reviews/new`);
  await page.getByLabel("感想").fill("短い感想");
  await expect(page.getByRole("button", { name: "投稿する" })).toBeDisabled();
  expect(called).toBe(false);
});

test("自分の感想を「投稿した感想」ページから編集できる", async ({ page }) => {
  const book = await seedBook();
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const review = await testPrisma.review.create({
    data: { userId: me.id, bookId: book.id, body: "編集前の感想本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  await page.goto("/my-reviews");
  await page.getByRole("button", { name: "編集" }).click();
  await page.getByRole("textbox").fill("編集後の感想本文になりました。");
  await page.getByText("ネタバレを含む").click();
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("編集後の感想本文になりました。")).toBeVisible();
  await expect(page.getByText("ネタバレあり")).toBeVisible();

  const updated = await testPrisma.review.findUniqueOrThrow({ where: { id: review.id } });
  expect(updated.body).toBe("編集後の感想本文になりました。");
  expect(updated.isSpoiler).toBe(true);
});

test("自分の感想を削除できる", async ({ page }) => {
  const book = await seedBook();
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const review = await testPrisma.review.create({
    data: { userId: me.id, bookId: book.id, body: "削除される感想本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  await page.goto("/my-reviews");
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "削除する" }).click();

  await expect(page.getByText("まだ感想を投稿していません。")).toBeVisible();
  const deleted = await testPrisma.review.findUnique({ where: { id: review.id } });
  expect(deleted).toBeNull();
});

test("他ユーザーの感想にいいねできる", async ({ page }) => {
  const book = await seedBook();
  const other = await createOtherUser();
  const review = await testPrisma.review.create({
    data: { userId: other.id, bookId: book.id, body: "他ユーザーの感想本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  await page.goto(`/books/${book.id}`);
  const reviewItem = page
    .getByText("他ユーザーの感想本文です。")
    .locator("visible=true")
    .locator("xpath=ancestor::li[1]");
  const [likeResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(`/api/reviews/${review.id}/likes`)),
    reviewItem.getByText("♡", { exact: true }).click(),
  ]);
  expect(likeResponse.ok()).toBe(true);
  await expect(reviewItem.getByText("♥", { exact: true })).toBeVisible();

  const likes = await testPrisma.like.findMany({ where: { reviewId: review.id } });
  expect(likes).toHaveLength(1);
});

test("他ユーザーの感想を通報でき、「通報済み」表示になる", async ({ page }) => {
  const book = await seedBook();
  const other = await createOtherUser();
  const review = await testPrisma.review.create({
    data: { userId: other.id, bookId: book.id, body: "通報対象の感想本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  await page.goto(`/books/${book.id}`);
  const reviewItem = page
    .getByText("通報対象の感想本文です。")
    .locator("visible=true")
    .locator("xpath=ancestor::li[1]");
  await reviewItem.getByRole("button", { name: "通報" }).click();
  await page.getByRole("button", { name: "通報する" }).click();
  await expect(reviewItem.getByText("通報済み")).toBeVisible();

  const reports = await testPrisma.report.findMany({ where: { reviewId: review.id } });
  expect(reports).toHaveLength(1);
});

test("他ユーザーの感想はAPI経由でも編集・削除できず403が返る", async ({ page }) => {
  const book = await seedBook();
  const other = await createOtherUser();
  const review = await testPrisma.review.create({
    data: { userId: other.id, bookId: book.id, body: "編集不可の感想本文です。", isSpoiler: false, isPublic: true },
  });

  await login(page);
  const patchRes = await page.request.patch(`/api/reviews/${review.id}`, {
    data: { body: "書き換えを試みる本文です。" },
  });
  expect(patchRes.status()).toBe(403);

  const deleteRes = await page.request.delete(`/api/reviews/${review.id}`);
  expect(deleteRes.status()).toBe(403);

  const unchanged = await testPrisma.review.findUniqueOrThrow({ where: { id: review.id } });
  expect(unchanged.body).toBe("編集不可の感想本文です。");
});

test("同一ユーザーが同じ本に2件目の感想を投稿しても、重複禁止制約が無いため両方投稿・表示される", async ({
  page,
}) => {
  const book = await seedBook();
  await login(page);

  await page.goto(`/books/${book.id}/reviews/new`);
  await page.getByLabel("感想").fill("1件目の感想本文です。");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`));

  await page.goto(`/books/${book.id}/reviews/new`);
  await page.getByLabel("感想").fill("2件目の感想本文です。");
  await page.getByRole("button", { name: "投稿する" }).click();
  await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`));

  await expect(page.getByText("1件目の感想本文です。")).toBeVisible();
  await expect(page.getByText("2件目の感想本文です。")).toBeVisible();

  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const reviews = await testPrisma.review.findMany({ where: { userId: me.id, bookId: book.id } });
  expect(reviews).toHaveLength(2);
});
