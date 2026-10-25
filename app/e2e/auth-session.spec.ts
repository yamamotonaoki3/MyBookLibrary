import { test, expect } from "@playwright/test";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { logout } from "./fixtures/auth";
import { sessionLifetimeSeconds } from "./fixtures/session";
import { BROWSER_SESSION_COOKIE } from "../src/lib/sessionPolicy";

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

// ブラウザを閉じると消える目印の Cookie（#782）。閉じたあとは、その Cookie だけが無い状態になる。
for (const { remember, expectedPath } of [
  { remember: false, expectedPath: "/login" },
  { remember: true, expectedPath: "/" },
]) {
  test(`ログイン保持${remember ? "あり" : "なし"}で、ブラウザを閉じた後に /login を開くと ${expectedPath === "/" ? "ダッシュボード" : "ログイン画面"} が表示される`, async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(E2E_USER.email);
    await page.getByLabel("パスワード", { exact: true }).fill(E2E_USER.password);
    await page.getByRole("checkbox").setChecked(remember);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();

    const hasMarker = async () => (await context.cookies()).some((cookie) => cookie.name === BROWSER_SESSION_COOKIE);
    expect(await hasMarker()).toBe(!remember);

    // ブラウザを閉じた状態（目印の Cookie だけが消え、トークンは残る）を再現する
    await context.clearCookies({ name: BROWSER_SESSION_COOKIE });

    // 最初のリクエストで、サーバーが判定する。ダッシュボードを一度も経由しない
    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });
    await page.goto("/login");
    await expect(page).toHaveURL(new RegExp(`${expectedPath === "/" ? "/$" : "/login"}`));
    if (!remember) {
      await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
      expect(visited).not.toContain("/");
      await page.goto("/books");
      await expect(page).toHaveURL(/\/login/);
    }
  });
}
