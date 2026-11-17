import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "../e2e/fixtures/auth";

// The scanner must receive a live synthetic stream, never a physical camera.
test.use({
  serviceWorkers: "allow",
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

const isbn = "9784101010014";

test.beforeEach(async ({ context }) => {
  await resetDb();
  await seedE2e();
  await context.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host) ? route.continue() : route.abort();
  });
});

test("production CSP keeps SW registration, hydration, and the fake camera working", async ({ page, context, request }) => {
  const response = await request.get("/login");
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("script-src 'self' 'unsafe-inline'");
  expect(policy).not.toContain("unsafe-eval");
  for (const path of ["/sw.js", "/manifest.json"]) {
    const asset = await request.get(path, { maxRedirects: 0 });
    expect(asset.status()).toBe(200);
    expect(asset.headers()["x-content-type-options"]).toBe("nosniff");
  }
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "testuser_pwa_protection_author" } });
  const stubOrigin = new URL(process.env.PROTECTION_STUB_ORIGIN ?? "http://localhost:3999").origin;
  await testPrisma.userLibrary.create({ data: {
    userId: user.id, systemid: "Tokyo_Bunkyo", libkey: "図書館",
    name: "[E2E_TEST] 架空のテスト図書館", pref: "東京都",
  } });
  const books: { title: string }[] = [];
  for (const [title, coverImageUrl] of [["[E2E_TEST] 読み込める書影", stubOrigin + "/stub/dummy.jpg"], ["[E2E_TEST] 取得失敗の書影", stubOrigin + "/stub/missing.jpg"]]) {
    const book = await testPrisma.book.create({ data: { title, authorId: author.id, isbn: books.length === 0 ? isbn : null, coverImageUrl, publishedAt: new Date("2026-01-01") } });
    await testPrisma.readingStatus.create({ data: { userId: user.id, bookId: book.id, status: "reading" } });
    books.push(book);
  }
  await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.grantPermissions(["camera"]);
  await page.goto("/books");
  const goodCard = page.getByRole("link", { name: books[0].title, exact: true }).first().locator("xpath=ancestor::*[@data-slot='card'][1]");
  const failedCard = page.getByRole("link", { name: books[1].title, exact: true }).first().locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect.poll(() => goodCard.getByRole("img").evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(failedCard.getByText("No Image")).toBeVisible();
  const screenshotDir = process.env.PROTECTION_SCREENSHOT_DIR;
  if (screenshotDir) { await fs.mkdir(screenshotDir, { recursive: true }); await failedCard.screenshot({ path: path.join(screenshotDir, "cover-fallback.png") }); }
  // SW-controlled fetches bypass page.route: exercise the real API and server-side calil stub.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("/sw.js");
  const availabilityResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/calil/check-book");
  await goodCard.getByRole("button", { name: "貸出チェック", exact: true }).click();
  const availability = await availabilityResponse;
  expect(availability.status()).toBe(200);
  expect((await availability.json()).results[isbn]).toEqual([{
    systemid: "Tokyo_Bunkyo", libkey: "図書館", libname: "[E2E_TEST] 架空のテスト図書館",
    loanStatus: "貸出可", reserveurl: stubOrigin + "/stub/reserve",
  }]);
  const reservation = page.getByRole("link", { name: /予約する.*外部サイト.*新しいタブ/ });
  await expect(reservation).toBeVisible();
  await expect(page.getByText("[E2E_TEST] 架空のテスト図書館", { exact: true })).toBeVisible();
  await expect(reservation).toHaveAttribute("href", stubOrigin + "/stub/reserve");
  await expect(reservation).toHaveAttribute("target", "_blank");
  await expect(reservation).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await reservation.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(stubOrigin + "/stub/reserve");
  await expect(popup.getByRole("heading", { name: "[E2E_TEST] ローカル予約先", exact: true })).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  if (screenshotDir) await page.getByRole("heading", { name: "版ごとの在庫状況" }).locator("xpath=ancestor::div[contains(@class, 'max-h-')][1]").screenshot({ path: path.join(screenshotDir, "external-reservation.png") });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.goto("/books/search");
  await page.getByRole("button", { name: "バーコードで登録", exact: true }).click();
  await expect(page.getByText("本の裏表紙のバーコードをカメラに向けてください")).toBeVisible();
  await expect.poll(() => page.locator("#barcode-reader video").evaluate((element: HTMLVideoElement) => element.videoWidth)).toBeGreaterThan(0);
  expect(await page.locator("#barcode-reader video").evaluate((element: HTMLVideoElement) => (element.srcObject as MediaStream).getVideoTracks()[0].readyState)).toBe("live");
  await page.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(page.locator("#barcode-reader video")).toHaveCount(0);
});
