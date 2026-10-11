import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

// NDLサーチが極端に遅い（混雑時に数十秒かかる／応答しない）状況でも、未登録の本の
// 読書ステータス変更が数秒で完了することを検証する（#634）。
// スタブサーバー（e2e/stub-server.ts）の応答遅延を `/__stub/delay` で設定して再現する。
const STUB_PORT = 3999;
const STUB_AUTHOR = "夏目漱石";
const STUB_TITLE = "吾輩は猫である";

async function stubControl(path: string) {
  const res = await fetch(`http://localhost:${STUB_PORT}${path}`);
  expect(res.ok).toBe(true);
}

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
  await stubControl("/__stub/reset");
});

test.afterEach(async () => {
  await stubControl("/__stub/reset");
});

test("NDLが極端に遅くても、未登録の本のステータス変更が数秒で完了する", async ({ page }) => {
  test.setTimeout(60_000);
  const author = await testPrisma.author.create({ data: { name: STUB_AUTHOR } });
  await login(page);
  await page.goto(`/favorite-authors/${author.id}`);
  const card = page
    .locator("div.rounded-lg")
    .filter({ hasText: STUB_TITLE })
    .filter({ has: page.getByRole("group", { name: "読書ステータス" }) })
    .filter({ visible: true })
    .last();
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");

  // 開発サーバーの初回コンパイルを計測に含めないため、遅延の設定前にAPIを一度呼んでおく
  const warmup = await page.request.post("/api/reading-status", {
    data: { title: "[E2E_TEST] ウォームアップ", author: "testuser_warmup", status: "unread", isbn: "9780000000999" },
  });
  expect(warmup.ok()).toBe(true);

  // NDLの応答を15秒遅らせる（NDLのタイムアウトは4秒、保存前処理の全体予算は6秒）
  await stubControl("/__stub/delay?target=ndl&ms=15000");

  const startedAt = Date.now();
  await card.getByRole("button", { name: "読了" }).click();
  await expect(card.getByText("本の情報を取得中")).toBeVisible();

  // NDLを待ち続けず、タイムアウト後に楽天の結果／fallbackで登録されて完了する
  await expect(card.getByText("本の情報を取得中")).toBeHidden({ timeout: 10_000 });
  await expect(card.getByRole("link", { name: "感想を書く" })).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(8_000);

  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
  const saved = await testPrisma.readingStatus.findFirst({
    where: { userId: user.id, book: { title: STUB_TITLE } },
  });
  expect(saved?.status).toBe("read");
});
