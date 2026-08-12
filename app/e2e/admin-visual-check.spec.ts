import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { loginAsAdmin } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

/**
 * Issue #453（管理画面を「設定・管理・監査ログ」の3タブに再構成）の
 * 手動確認手順を自動E2E化したもの。タブの並び・切替、および
 * 監査ログタブ埋め込み時のヘッダー非表示を確認する。
 */
test("管理画面のタブが「設定」「管理」「監査ログ」の順で表示され、切り替えられる", async ({
  page,
}) => {
  await loginAsAdmin(page);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理画面" })).toBeVisible();

  const tablist = page.getByRole("tablist");
  const tabs = tablist.getByRole("tab");
  await expect(tabs).toHaveText(["設定", "管理", "監査ログ"]);

  const settingsTab = tablist.getByRole("tab", { name: "設定" });
  const managementTab = tablist.getByRole("tab", { name: "管理" });
  const auditTab = tablist.getByRole("tab", { name: "監査ログ" });

  await expect(managementTab).toHaveAttribute("aria-selected", "true");
  await expect(settingsTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByText("ユーザーロールの設定")).toBeVisible();

  await settingsTab.click();
  await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  await expect(managementTab).toHaveAttribute("aria-selected", "false");

  await auditTab.click();
  await expect(auditTab).toHaveAttribute("aria-selected", "true");
  // タブ埋め込み時は単独ページ用の見出し・戻るリンクが表示されない。
  await expect(
    page.getByRole("link", { name: "← 管理画面に戻る" })
  ).not.toBeVisible();
});
