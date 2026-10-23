import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { login, loginAsAdmin } from "../e2e/fixtures/auth";
import { sessionLifetimeSeconds } from "../e2e/fixtures/session";

/**
 * デモ環境の保護（DEMO_MODE=true で起動したアプリ。npm run test:e2e:demo）。
 * 禁止する操作が拒否され、注意書きとデモアカウントの案内が出て、Google ログイン・新規登録などの導線が出ないことを確認する。
 */
test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

test("デモの実JWTはセッション再取得後も15分の有効期間を維持する", async ({ page }) => {
  await login(page);
  expect(await sessionLifetimeSeconds(page)).toBe(15 * 60);
  const session = await page.request.get("/api/auth/session");
  expect(session.ok()).toBe(true);
  expect(await sessionLifetimeSeconds(page)).toBe(15 * 60);
});

test("ログイン画面: 注意書きとデモアカウントの案内が出て、Google ログイン・新規登録・パスワード再設定の導線は出ない", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByTestId("demo-banner")).toContainText("デモ環境です。個人情報は入力しないでください");
  await expect(page.getByTestId("demo-login-hint")).toContainText("demo_sakura@example.com");
  await expect(page.getByRole("button", { name: "Googleでログイン" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /新規登録/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /パスワードを忘れた/ })).toHaveCount(0);
});

test("新規登録・パスワードの再設定の画面は、案内だけで、フォームは出ない", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByTestId("demo-register-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントを作成" })).toHaveCount(0);

  await page.goto("/forgot-password");
  await expect(page.getByTestId("demo-forgot-password-notice")).toBeVisible();
});

test("ログイン後: 設定に、合言葉・アカウント削除は出ない。パスワード変更の画面は案内だけ。注意書きは常に出る", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("demo-banner")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByText("秘密の言葉", { exact: true })).toHaveCount(0);
  await expect(page.getByText("アカウント削除", { exact: true })).toHaveCount(0);
  // パスワード変更へのリンクも出ない（変更できないため）
  await expect(page.getByRole("link", { name: "パスワードを変更する" })).toHaveCount(0);

  await page.goto("/settings/change-password");
  await expect(page.getByTestId("demo-change-password-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: /変更/ })).toHaveCount(0);
});

test("禁止する操作の API は、ログイン済みでも 403（DEMO_MODE）", async ({ page }) => {
  await login(page);

  const results = await Promise.all([
    page.request.post("/api/user/change-password", { data: { currentPassword: "x", password: "y", confirmPassword: "y" } }),
    page.request.post("/api/user/secret-word", { data: { secretWord: "x" } }),
    page.request.delete("/api/user/delete"),
    page.request.post("/api/auth/reset-password", { data: { step: "check", email: "e2e-test@example.com" } }),
    page.request.post("/api/auth/register", { data: { name: "testuser_demo", email: "testuser_demo@example.com", password: "TestPass123!" } }),
    page.request.post("/api/contact", { data: { category: "general", subject: "件名", body: "本文" } }),
  ]);

  for (const response of results) {
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "DEMO_MODE" });
  }
});

test("管理者でも、管理者の画面は開けず、管理者の API は 403（DEMO_MODE）", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);

  const stats = await page.request.get("/api/admin/stats");
  expect(stats.status()).toBe(403);
  expect(await stats.json()).toMatchObject({ code: "DEMO_MODE" });
  const users = await page.request.get("/api/admin/users");
  expect(users.status()).toBe(403);
});

test("デモ環境の初期化の API は、Bearer なしでは拒否される", async ({ request }) => {
  const response = await request.get("/api/cron/reset-demo");
  expect(response.status()).toBe(401);
});
