import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

const stub = "http://localhost:3999";
test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});
test.afterEach(async ({ request }) => {
  expect((await request.get(`${stub}/__stub/reset`)).ok()).toBe(true);
});

test("検索APIの外部タイムアウトは504となり、画面から同じ条件で再試行できる", async ({ page, request }) => {
  test.setTimeout(60_000);
  const query = `timeout${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  await login(page);
  // コンパイルを済ませてから、実際のRoute Handler→外部スタブを遅延させる。
  expect((await page.request.get("/api/books/search?q=warmup&type=title")).ok()).toBe(true);
  expect((await request.get(`${stub}/__stub/delay?target=rakuten&ms=20000`)).ok()).toBe(true);
  const timedOut = page.waitForResponse(res => res.url().includes("/api/books/search?") && res.status() === 504);
  // 成功応答のキャッシュを避けるため、ウォームアップとは別の実行ごとに一意な検索語を使う。
  await page.goto(`/books/search?q=${query}&type=title`);
  expect(await (await timedOut).json()).toMatchObject({ code: "SEARCH_TIMEOUT" });
  await expect(page.getByText("検索に時間がかかっています。もう一度お試しください。")).toBeVisible();
  await expect(page.getByRole("button", { name: "検索中…" })).toBeHidden();
  expect((await request.get(`${stub}/__stub/reset`)).ok()).toBe(true);
  const success = page.waitForResponse(res => res.url().includes("/api/books/search?") && res.status() === 200);
  await page.getByRole("button", { name: "再試行" }).click();
  expect((await (await success).json()).items.length).toBeGreaterThan(0);
  await expect(page.getByText(/件表示中/)).toBeVisible();
});
