import { test, expect } from "@playwright/test";
import { login, logout } from "./fixtures/auth";

/**
 * Phase 0 のスモークテスト。ログイン→書籍検索→読書ステータス登録→
 * レビュー投稿→ログアウトの一連の流れが壊れていないことを確認する。
 *
 * 外部API（楽天）はスタブサーバー（#434）が返す固定フィクスチャを使う。
 * `e2e/fixtures/external/rakuten-search.json` の書籍（ISBN 9784101010014）
 * が検索結果として返る前提。
 */
test("ログイン → 書籍検索 → 読書ステータス登録 → レビュー投稿 → ログアウト", async ({ page }) => {
  await login(page);

  await page.goto("/books/search");
  await page.getByPlaceholder("タイトルを入力（例：吾輩は猫である）").fill("吾輩は猫である");
  await page.getByRole("button", { name: "検索" }).click();

  const bookLink = page.getByRole("link", { name: "吾輩は猫である", exact: true });
  await expect(bookLink).toBeVisible();

  await bookLink.click();
  await expect(page).toHaveURL(/\/books\/isbn\/9784101010014/);

  await page.getByRole("button", { name: "読了" }).click();
  await expect(page.getByRole("button", { name: "読了" })).toHaveClass(/bg-green-600/);

  await page.getByRole("link", { name: "感想を書く" }).click();
  await expect(page).toHaveURL(/\/reviews\/new$/);

  await page.getByLabel("感想").fill("スタブ経由のE2Eスモークテストで投稿した感想です。");
  await page.getByRole("button", { name: "投稿する" }).click();

  await expect(page).toHaveURL(/\/books\/\d+$/);
  await expect(page.getByText("スタブ経由のE2Eスモークテストで投稿した感想です。")).toBeVisible();

  await logout(page);
});
