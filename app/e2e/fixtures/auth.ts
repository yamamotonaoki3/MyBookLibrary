/**
 * ログイン操作のヘルパー。`prisma/seed.e2e.ts` の `E2E_USER` を使う。
 *
 * このスモークテストではログイン自体を検証対象に含むため、あえて
 * `storageState` を使わず毎回フォームからログインする。今後ログイン後の
 * 状態から始める複数のテストを追加する場合は、`login()` を使う
 * `*.setup.ts` プロジェクトで `storageState` を1回だけ生成し、
 * `test.use({ storageState: ... })` で使い回す構成に拡張できる。
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_USER, E2E_ADMIN } from "../../prisma/seed.e2e";

export { E2E_USER, E2E_ADMIN };

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(E2E_USER.email);
  await page.getByLabel("パスワード", { exact: true }).fill(E2E_USER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(E2E_ADMIN.email);
  await page.getByLabel("パスワード", { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login/);
}
