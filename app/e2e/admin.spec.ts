import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { seedE2e, E2E_ADMIN } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { loginAsAdmin } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function createTargetUser() {
  const passwordHash = await bcrypt.hash("TargetUserPass123!", 12);
  return testPrisma.user.create({
    data: {
      name: "権限変更対象ユーザー",
      email: "e2e-role-target@example.com",
      password: passwordHash,
      role: "user",
    },
  });
}

async function openManagementCard(page: import("@playwright/test").Page, cardTitle: string) {
  await page.getByRole("button", { name: cardTitle }).click();
}

test("ユーザー管理でユーザーの権限を変更できる", async ({ page }) => {
  const target = await createTargetUser();

  await loginAsAdmin(page);
  await page.goto("/admin");
  await openManagementCard(page, "ユーザーロールの設定");

  const row = page.getByRole("row", { name: new RegExp(target.name) });
  await row.getByRole("button", { name: "詳細" }).click();

  await page.getByRole("button", { name: "管理者にする" }).click();
  const [patchRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes(`/api/admin/users/${target.id}`) && res.request().method() === "PATCH"
    ),
    page.getByRole("button", { name: "管理者にする" }).click(),
  ]);
  expect(patchRes.ok()).toBe(true);

  const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
  expect(updated.role).toBe("admin");
});

test("手動登録本を編集・削除できる", async ({ page }) => {
  const author = await testPrisma.author.create({ data: { name: "手動登録著者" } });
  const admin = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_ADMIN.email } });
  const manualBook = await testPrisma.book.create({
    data: {
      title: "手動登録された本",
      authorId: author.id,
      source: "manual",
      createdByUserId: admin.id,
      publishedAt: new Date("2020-01-01"),
    },
  });

  await loginAsAdmin(page);
  await page.goto("/admin");
  await openManagementCard(page, "手動登録本の管理");

  const row = page.getByRole("row", { name: new RegExp(manualBook.title) });
  await row.getByRole("button", { name: "詳細" }).click();

  // 詳細モーダルの入力欄はlabelにhtmlFor/idが無く関連付けられていないため、
  // モーダルの見出しから辿ってスコープを絞り、出現順（タイトル→著者→ISBN）で操作する。
  const detailDialog = page
    .getByRole("heading", { name: "手動登録本の詳細" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await page.getByRole("button", { name: "編集" }).click();
  await detailDialog.locator("input").nth(0).fill("編集後の手動登録本");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("cell", { name: "編集後の手動登録本" })).toBeVisible();

  const updated = await testPrisma.book.findUniqueOrThrow({ where: { id: manualBook.id } });
  expect(updated.title).toBe("編集後の手動登録本");

  await page.getByRole("button", { name: "詳細" }).click();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "削除する" }).click();

  await expect(page.getByText("手動登録された本はありません。")).toBeVisible();
  const deleted = await testPrisma.book.findUnique({ where: { id: manualBook.id } });
  expect(deleted).toBeNull();
});

test("重複する手動登録本を統合できる", async ({ page }) => {
  const author = await testPrisma.author.create({ data: { name: "統合対象著者" } });
  const bookA = await testPrisma.book.create({
    data: { title: "統合元の本", authorId: author.id, source: "manual", publishedAt: new Date("2020-01-01") },
  });
  const bookB = await testPrisma.book.create({
    data: { title: "統合先の本", authorId: author.id, source: "manual", publishedAt: new Date("2020-01-01") },
  });

  await loginAsAdmin(page);
  await page.goto("/admin");
  await openManagementCard(page, "手動登録本の管理");

  // このタブでは「手動登録本の管理」以外のアコーディオンは閉じているため、
  // 統合元・統合先のセレクトがページ内で唯一のcomboboxとして特定できる。
  await page.getByRole("combobox").nth(0).selectOption(String(bookA.id));
  await page.getByRole("combobox").nth(1).selectOption(String(bookB.id));
  const [mergeRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/admin/manual-books/merge") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: "統合する" }).click(),
  ]);
  expect(mergeRes.ok()).toBe(true);

  await expect(page.getByText("統合しました。")).toBeVisible();
  const source = await testPrisma.book.findUnique({ where: { id: bookA.id } });
  expect(source).toBeNull();
  const target = await testPrisma.book.findUniqueOrThrow({ where: { id: bookB.id } });
  expect(target.title).toBe("統合先の本");
});

test("賞エントリを登録でき、監査ログには記録されない一方、ロール変更操作は監査ログに記録される", async ({
  page,
}) => {
  const award = await testPrisma.award.create({ data: { name: "E2Eテスト賞" } });
  const target = await createTargetUser();

  await loginAsAdmin(page);
  await page.goto("/admin");

  // 賞エントリ登録（検索を使わず直接フォーム入力）。
  // フォームの入力欄はlabelにhtmlFor/idが無く関連付けられていないため、
  // 「登録する」ボタンを持つformにスコープを絞り、出現順で操作する。
  await openManagementCard(page, "受賞作品登録");
  const registerForm = page.locator("form").filter({ has: page.getByRole("button", { name: "登録する" }) });
  await registerForm.locator('input[type="text"]').nth(0).fill("直接入力で登録する本");
  await registerForm.locator('input[type="text"]').nth(1).fill("直接入力著者");
  await registerForm.locator("select").nth(0).selectOption(String(award.id));
  await registerForm.getByRole("button", { name: "登録する" }).click();

  await expect(page.getByText("登録しました。")).toBeVisible();
  const entry = await testPrisma.awardEntry.findFirstOrThrow({ where: { awardId: award.id } });
  expect(entry).toBeTruthy();
  const auditLogsAfterAward = await testPrisma.auditLog.count();
  expect(auditLogsAfterAward).toBe(0);

  // ロール変更操作を実行し、監査ログタブに記録されることを確認する
  await openManagementCard(page, "ユーザーロールの設定");
  const row = page.getByRole("row", { name: new RegExp(target.name) });
  await row.getByRole("button", { name: "詳細" }).click();
  await page.getByRole("button", { name: "管理者にする" }).click();
  const [roleRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes(`/api/admin/users/${target.id}`) && res.request().method() === "PATCH"
    ),
    page.getByRole("button", { name: "管理者にする" }).click(),
  ]);
  expect(roleRes.ok()).toBe(true);

  await page.getByRole("tab", { name: "監査ログ" }).click();
  await expect(page.getByRole("cell", { name: "管理者: ロール変更" })).toBeVisible();
});

test("NDL検索経由で本を検索し、受賞作品登録フォームに反映できる", async ({ page }) => {
  const award = await testPrisma.award.create({ data: { name: "NDL経由登録賞" } });

  // 管理画面のNDL検索は本物のNDL SRU APIへ直接アクセスする実装（スタブサーバーを
  // 経由しない）のため、外部通信を避けてブラウザからの同一オリジンリクエストを
  // page.route でモックする。
  await page.route("**/api/admin/ndl-search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          title: "NDL検索結果の本",
          author: "NDL経由著者",
          publisher: "スタブ出版社",
          date: "2020.01",
          isbn: "9784000000099",
          coverImageUrl: null,
        },
      ]),
    });
  });

  await loginAsAdmin(page);
  await page.goto("/admin");
  await openManagementCard(page, "書籍キーワードで検索");
  await page.getByRole("button", { name: "国立国会図書館" }).click();
  await page.getByPlaceholder(/容疑者Xの献身/).fill("NDL検索結果の本");
  await page.getByRole("button", { name: "検索", exact: true }).click();

  await expect(page.getByText("NDL検索結果の本")).toBeVisible();
  await page.getByRole("button", { name: "選択" }).click();

  const registerForm = page.locator("form").filter({ has: page.getByRole("button", { name: "登録する" }) });
  await expect(registerForm.locator('input[type="text"]').nth(0)).toHaveValue("NDL検索結果の本");
  await expect(registerForm.locator('input[type="text"]').nth(1)).toHaveValue("NDL経由著者");
  await registerForm.locator("select").nth(0).selectOption(String(award.id));
  await registerForm.getByRole("button", { name: "登録する" }).click();

  await expect(page.getByText("登録しました。")).toBeVisible();
  const entry = await testPrisma.awardEntry.findFirstOrThrow({ where: { awardId: award.id } });
  const book = await testPrisma.book.findUniqueOrThrow({ where: { id: entry.bookId } });
  expect(book.title).toBe("NDL検索結果の本");
});

test("CSVから一括インポートできる", async ({ page }) => {
  const award = await testPrisma.award.create({ data: { name: "CSVインポート賞" } });
  const csvContent = `title,author,isbn,coverImageUrl,publishedAt,awardId,year,type\nCSVインポート本,CSV著者,,,2020年01月01日,${award.id},2020,winner\n`;

  await loginAsAdmin(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "CSVから一括インポート" }).click();

  await page.setInputFiles('input[type="file"]', {
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent, "utf-8"),
  });
  await page.getByRole("button", { name: "インポート実行" }).click();

  await expect(page.getByText("成功: 1 件")).toBeVisible();
  const entry = await testPrisma.awardEntry.findFirstOrThrow({ where: { awardId: award.id } });
  const book = await testPrisma.book.findUniqueOrThrow({ where: { id: entry.bookId } });
  expect(book.title).toBe("CSVインポート本");
});

test("CSVが不正フォーマットの場合、エラー内容が表示され登録されない", async ({ page }) => {
  const csvContent = `title,author,isbn,coverImageUrl,publishedAt,awardId,year,type\n不正な行の本,不正著者,,,,not-a-number,2020,winner\n`;

  await loginAsAdmin(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "CSVから一括インポート" }).click();

  await page.setInputFiles('input[type="file"]', {
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent, "utf-8"),
  });
  await page.getByRole("button", { name: "インポート実行" }).click();

  await expect(page.getByText("成功: 0 件")).toBeVisible();
  await expect(page.getByText(/awardId・year は数値で指定してください/)).toBeVisible();

  const book = await testPrisma.book.findFirst({ where: { title: "不正な行の本" } });
  expect(book).toBeNull();
});
