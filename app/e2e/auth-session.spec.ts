import { test, expect } from "@playwright/test";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { logout } from "./fixtures/auth";
import { sessionLifetimeSeconds } from "./fixtures/session";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

for (const { remember, seconds } of [
  { remember: false, seconds: 8 * 60 * 60 },
  { remember: true, seconds: 30 * 24 * 60 * 60 },
]) {
  test(`ログイン保持${remember ? "あり" : "なし"}の実JWT期限を維持し、ログアウトで無効になる`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(E2E_USER.email);
    await page.getByLabel("パスワード", { exact: true }).fill(E2E_USER.password);
    await page.getByRole("checkbox").setChecked(remember);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
    expect(await sessionLifetimeSeconds(page)).toBe(seconds);
    // セッション再取得でAuth.jsがJWTを再発行しても、保持設定ごとの期間を維持する。
    const session = await page.request.get("/api/auth/session");
    expect(session.ok()).toBe(true);
    expect((await session.json()).user.email).toBe(E2E_USER.email);
    expect(await sessionLifetimeSeconds(page)).toBe(seconds);
    await logout(page);
    const afterLogout = await page.request.get("/api/auth/session");
    expect(afterLogout.ok()).toBe(true);
    expect(await afterLogout.json()).toBeNull();
    await page.goto("/books");
    await expect(page).toHaveURL(/\/login/);
  });
}
