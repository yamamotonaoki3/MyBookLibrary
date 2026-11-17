import { test, expect, type Page } from "@playwright/test";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login, loginAsAdmin } from "./fixtures/auth";

const stubOrigin = process.env.PROTECTION_STUB_ORIGIN ?? "http://localhost:3999";
const goodTitle = "[E2E_TEST] <b>cover title</b>";
const badTitle = "[E2E_TEST] failed cover";
const legacyTitle = "[E2E_TEST] legacy cover";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

// Browser requests are isolated as well as the server-side API stubs in the config.
test.beforeEach(async ({ context }) => {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/stub/dummy.jpg") return route.fulfill({ contentType: "image/png", body: png });
    return route.continue();
  });
  await resetDb();
  await seedE2e();
});

async function seedCovers() {
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "testuser_protection_author" } });
  const books = [];
  for (const [title, coverImageUrl] of [[goodTitle, stubOrigin + "/stub/dummy.jpg"], [badTitle, stubOrigin + "/stub/missing.jpg"], [legacyTitle, "ftp://example.com/legacy.jpg"]]) {
    const book = await testPrisma.book.create({ data: { title, authorId: author.id, source: "manual", createdByUserId: user.id, coverImageUrl, publishedAt: new Date("2026-01-01") } });
    await testPrisma.readingStatus.create({ data: { userId: user.id, bookId: book.id, status: "reading" } });
    books.push(book);
  }
  return books;
}
function card(page: Page, title: string) {
  return page.getByRole("link", { name: title, exact: true }).first().locator("xpath=ancestor::*[@data-slot='card'][1]");
}

test("real response headers preserve login/hydration and block a foreign script", async ({ page, request }) => {
  for (const path of ["/login", "/api/version", "/api/auth/session"]) {
    const response = await request.get(path);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["permissions-policy"]).toContain("camera=(self)");
    expect(response.headers()["content-security-policy"]).toContain("object-src 'none'");
  }
  await login(page);
  await page.evaluate(() => {
    (window as unknown as { protectionViolations: string[] }).protectionViolations = [];
    document.addEventListener("securitypolicyviolation", event => (window as unknown as { protectionViolations: string[] }).protectionViolations.push(event.effectiveDirective));
  });
  await page.route(stubOrigin + "/controlled-script.js", route => route.fulfill({ contentType: "text/javascript", body: "window.controlledForeignScriptExecuted = true" }));
  await page.evaluate(src => { const script = document.createElement("script"); script.src = src; document.body.appendChild(script); }, stubOrigin + "/controlled-script.js");
  await expect.poll(() => page.evaluate(() => (window as unknown as { protectionViolations: string[] }).protectionViolations.some(value => value.startsWith("script-src")))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { controlledForeignScriptExecuted?: boolean }).controlledForeignScriptExecuted)).toBeUndefined();
  await page.getByRole("link", { name: "私の本一覧", exact: true }).first().click();
  await expect(page).toHaveURL(/\/books$/);
});

test("covers load/fall back, untrusted titles stay text, legacy metadata keeps status changes working", async ({ page }) => {
  const books = await seedCovers();
  await login(page);
  await page.goto("/books");
  await expect(card(page, goodTitle).getByRole("img")).toBeVisible();
  await expect.poll(() => card(page, goodTitle).getByRole("img").evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(card(page, badTitle).getByText("No Image")).toBeVisible();
  await expect(card(page, legacyTitle).getByText("No Image")).toBeVisible();
  expect(await card(page, goodTitle).locator("h3 b").count()).toBe(0);
  await card(page, legacyTitle).getByRole("button", { name: "読了", exact: true }).click();
  await expect.poll(async () => (await testPrisma.readingStatus.findUniqueOrThrow({ where: { userId_bookId: { userId: books[2].createdByUserId!, bookId: books[2].id } } })).status).toBe("read");
});

test("reservation links preserve HTTP, announce the destination, and reject non-Web URLs", async ({ page, context }) => {
  await seedCovers();
  let reserveurl = stubOrigin + "/stub/reserve";
  await page.route("**/api/calil/check-book?*", route => route.fulfill({ json: { results: { "9780000000001": [{ systemid: "test", libkey: "test", libname: "testuser_library", loanStatus: "貸出可", reserveurl }] } } }));
  await context.route(stubOrigin + "/stub/reserve", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<h1>図書館予約（ローカルスタブ）</h1>" }));
  await login(page);
  await page.goto("/books");
  await card(page, goodTitle).getByRole("button", { name: "貸出チェック" }).click();
  const link = page.getByRole("link", { name: /予約する.*外部サイト.*新しいタブ/ });
  await expect(link).toHaveAttribute("href", reserveurl);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "図書館予約（ローカルスタブ）" })).toBeVisible();
  await popup.close();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  reserveurl = "ftp://example.com/reserve";
  await card(page, goodTitle).getByRole("button", { name: "貸出チェック" }).click();
  await expect(page.getByText("testuser_library")).toBeVisible();
  await expect(page.getByRole("link", { name: /予約する/ })).toHaveCount(0);
});

test("invalid cover inputs are rejected before book writes for ordinary and admin routes", async ({ page }) => {
  const [book] = await seedCovers();
  await login(page);
  const body = { title: "[E2E_TEST] rejected cover", author: "testuser_rejected_author", status: "reading", source: "manual", coverImageUrl: "ftp://example.com/cover.jpg" };
  expect((await page.request.post("/api/reading-status", { data: body })).status()).toBe(400);
  expect((await page.request.patch("/api/books/" + book.id, { data: body })).status()).toBe(400);
  expect(await testPrisma.book.count({ where: { title: body.title } })).toBe(0);
  // No provider or real external OAuth is used: the admin is the fixture's local credentials account.
  await page.context().clearCookies();
  await loginAsAdmin(page);
  const award = await testPrisma.award.create({ data: { name: "[E2E_TEST] protection award" } });
  expect((await page.request.post("/api/admin/award-entries", { data: { ...body, awardId: award.id, year: 2026, type: "winner" } })).status()).toBe(400);
  expect((await page.request.patch("/api/admin/manual-books/" + book.id, { data: { coverImageUrl: body.coverImageUrl } })).status()).toBe(400);
  const csv = "title,author,isbn,coverImageUrl,publishedAt,awardId,year,type\n" + body.title + "," + body.author + ",," + body.coverImageUrl + ",2026-01-01," + award.id + ",2026,winner";
  const imported = await page.request.post("/api/admin/import-csv", { multipart: { file: { name: "test.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } } });
  expect(imported.status()).toBe(200);
  expect(await imported.json()).toMatchObject({ success: 0, errors: [expect.stringContaining("HTTP(S)")] });
  expect(await testPrisma.book.count({ where: { title: body.title } })).toBe(0);
});
