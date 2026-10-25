import { test, expect, type Page } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

const isbn = "9784101010014";
const secondIsbn = "9784000000001";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function waitForSearchResults(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "貸出チェック", exact: true }).first();
  const rateLimited = page.getByText("リクエストが多すぎます。しばらくお待ちください。", { exact: true });
  await expect(button.or(rateLimited).first()).toBeVisible();
  if (await rateLimited.isVisible()) {
    // 検索APIの500ms制限を過ぎてから、同じ条件で実際の検索をやり直す。
    await page.waitForTimeout(600);
    await page.reload();
  }
  await expect(button).toBeVisible();
}

for (const screen of ["本一覧", "本検索", "著者別", "受賞作品", "本詳細"]) {
  test(`${screen}の貸出チェックで全版の結果を表示する`, async ({ page }) => {
    if (screen === "本一覧") await page.setViewportSize({ width: 390, height: 844 });
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
    const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
    const book = await testPrisma.book.create({ data: {
      title: "吾輩は猫である", authorId: author.id, isbn,
      publishedAt: new Date("1990-04-01"),
      bookIsbns: { create: [{ isbn, isPrimary: true }, { isbn: secondIsbn, isPrimary: false }] },
    } });
    await testPrisma.readingStatus.create({ data: { userId: user.id, bookId: book.id, status: "reading" } });
    await testPrisma.userLibrary.create({ data: {
      userId: user.id, systemid: "Tokyo_Bunkyo", libkey: "図書館", name: "[E2E_TEST] 図書館", pref: "東京都",
    } });
    const award = await testPrisma.award.create({ data: { name: "[E2E_TEST] 賞" } });
    await testPrisma.awardEntry.create({ data: { bookId: book.id, awardId: award.id, year: 2026, type: "winner" } });
    await login(page);
    const paths: Record<string, string> = {
      本一覧: "/books", 本検索: "/books/search?q=吾輩は猫である&type=title",
      著者別: `/favorite-authors/${author.id}`, 受賞作品: `/awards?awardId=${award.id}`,
      本詳細: `/books/${book.id}`,
    };
    await page.goto(paths[screen]);
    if (screen === "本検索") await waitForSearchResults(page);
    const button = page.getByRole("button", { name: "貸出チェック", exact: true }).first();
    await expect(button).toBeVisible();
    const response = page.waitForResponse(r => r.url().includes("/api/calil/check-book?") && r.status() === 200);
    await button.click();
    const result = await (await response).json();
    expect(Object.keys(result.results)).toEqual([isbn, secondIsbn]);
    await expect(page.getByRole("heading", { name: "版ごとの在庫状況" })).toBeVisible();
    await expect(page.getByText(`ISBN: ${isbn}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`ISBN: ${secondIsbn}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(page.getByRole("heading", { name: "版ごとの在庫状況" })).not.toBeVisible();
    if (screen === "本詳細") {
      const byEdition = await page.request.get(`/api/calil/check-book?isbn=${secondIsbn}`);
      expect(byEdition.status()).toBe(200);
      expect(Object.keys((await byEdition.json()).results)).toEqual([isbn, secondIsbn]);
    }
  });
}

test("検索が429を返しても、未登録の検索結果を登録せず貸出チェックできる", async ({ page }) => {
  let searchRequests = 0;
  await page.route("**/api/books/search?**", async (route) => {
    searchRequests += 1;
    if (searchRequests === 1) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "リクエストが多すぎます。しばらくお待ちください。" }),
      });
      return;
    }
    await route.continue();
  });
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
  await testPrisma.userLibrary.create({ data: {
    userId: user.id, systemid: "Tokyo_Bunkyo", libkey: "図書館", name: "[E2E_TEST] 図書館", pref: "東京都",
  } });
  await login(page);
  await page.goto("/books/search?q=吾輩は猫である&type=title");
  await waitForSearchResults(page);
  await page.getByRole("button", { name: "貸出チェック", exact: true }).first().click();
  await expect(page.getByText(`ISBN: ${isbn}`, { exact: true })).toBeVisible();
  expect(searchRequests).toBeGreaterThan(1);
  expect(await testPrisma.book.count()).toBe(0);
  expect(await testPrisma.readingStatus.count()).toBe(0);
});
