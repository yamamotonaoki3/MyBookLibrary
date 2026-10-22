import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => { await resetDb(); await seedE2e(); });
async function seedBook() {
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
  const other = await testPrisma.user.create({ data: { email: "e2euser_review_count@example.com", name: "件数テスト" } });
  const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
  const book = await testPrisma.book.create({ data: {
    title: "吾輩は猫である", authorId: author.id, isbn: "9784101010014", publishedAt: new Date("1990-04-01"),
    bookIsbns: { create: [{ isbn: "9784101010014", isPrimary: true }, { isbn: "9784000000001", isPrimary: false }] },
  } });
  await testPrisma.readingStatus.create({ data: { userId: user.id, bookId: book.id, status: "read" } });
  const reviews = await Promise.all([true, true, false].map((isPublic, i) => testPrisma.review.create({ data: {
    userId: user.id, bookId: book.id, body: `[E2E_TEST] レビュー件数の確認用本文${i}`, isPublic, isSpoiler: i === 1,
  } })));
  await testPrisma.review.create({ data: { userId: other.id, bookId: book.id, body: "[E2E_TEST] 他人の非公開レビュー", isPublic: false } });
  const award = await testPrisma.award.create({ data: { name: "[E2E_TEST] 件数賞" } });
  await testPrisma.awardEntry.create({ data: { awardId: award.id, bookId: book.id, year: 2026, type: "winner" } });
  return { user, author, book, award, reviews };
}
for (const screen of ["私の本一覧", "本検索", "著者別", "受賞作品", "ユーザー詳細", "本詳細", "本選択モーダル"]) {
  test(`${screen}に公開レビューのみの件数を表示する`, async ({ page }) => {
    const data = await seedBook();
    if (screen === "私の本一覧") await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    const paths: Record<string, string> = {
      私の本一覧: "/books", 本検索: "/books/search?q=吾輩は猫である&type=title",
      著者別: `/favorite-authors/${data.author.id}`, 受賞作品: `/awards?awardId=${data.award.id}`,
      ユーザー詳細: `/users/${data.user.id}`, 本詳細: `/books/${data.book.id}`, 本選択モーダル: "/my-reviews",
    };
    await page.goto(paths[screen]);
    if (screen === "本選択モーダル") await page.getByRole("button", { name: "感想を書く", exact: true }).click();
    if (screen === "本検索") {
      await expect(page.getByText("公開レビュー 2件").or(page.getByText("リクエストが多すぎます。しばらくお待ちください。"))).toBeVisible();
      if (await page.getByText("リクエストが多すぎます。しばらくお待ちください。").isVisible()) {
        await page.waitForTimeout(600); await page.reload();
      }
    }
    await expect(page.getByText("公開レビュー 2件", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("公開レビュー 4件", { exact: true })).toHaveCount(0);
  });
}
test("公開範囲の変更と削除後に再取得すると、0件まで更新される", async ({ page }) => {
  const { book, reviews } = await seedBook(); await login(page); await page.goto(`/books/${book.id}`);
  await expect(page.getByText("公開レビュー 2件", { exact: true })).toBeVisible();
  expect((await page.request.patch(`/api/reviews/${reviews[0].id}`, { data: { body: reviews[0].body, isPublic: false, isSpoiler: false } })).ok()).toBe(true);
  await page.reload(); await expect(page.getByText("公開レビュー 1件", { exact: true })).toBeVisible();
  expect((await page.request.delete(`/api/reviews/${reviews[1].id}`)).ok()).toBe(true);
  await page.reload(); await expect(page.getByText("公開レビュー 0件", { exact: true })).toBeVisible();
});
test("未登録の検索結果は0件で、表示しても本を登録しない", async ({ page }) => {
  await login(page); await page.goto("/books/search?q=吾輩は猫である&type=title");
  await expect(page.getByText("公開レビュー 0件", { exact: true }).first()).toBeVisible();
  expect(await testPrisma.book.count()).toBe(0);
});
