import { test, expect } from "@playwright/test";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb } from "../src/__tests__/helpers/dbTest";
import { login, logout } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

test("新規登録 → 登録直後にログインできる", async ({ page }) => {
  const email = `e2e-new-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("名前").fill("新規E2Eユーザー");
  await page.getByLabel("メールアドレス").fill(email);
  // ラベルに「(8文字以上)」の注記が入っており getByLabel(exact) では
  // マッチしないため、idで直接指定する。
  await page.locator("#password").fill("NewUserPass123!");
  await page.locator("#confirmPassword").fill("NewUserPass123!");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1/);
  await expect(page.getByText("登録が完了しました。ログインしてください。")).toBeVisible();

  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill("NewUserPass123!");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
});

test("パスワード変更: 確認欄が一致しない場合、クライアント側でブロックされAPIが呼ばれない", async ({
  page,
}) => {
  let changePasswordCalled = false;
  await page.route("**/api/user/change-password", async (route) => {
    changePasswordCalled = true;
    await route.continue();
  });

  await login(page);
  await page.goto("/settings/change-password");
  await page.getByLabel("現在のパスワード").fill(E2E_USER.password);
  await page.locator("#password").fill("NewUserPass123!");
  await page.locator("#confirmPassword").fill("DifferentPass456!");
  await page.getByRole("button", { name: "パスワードを変更する" }).click();

  await expect(page.getByText("パスワードが一致しません")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/change-password/);
  expect(changePasswordCalled).toBe(false);
});

async function setSecretWord(page: import("@playwright/test").Page, secretWord: string) {
  await page.goto("/settings");
  // SecretWordFormの入力はlabelとhtmlFor/idで関連付けられていないため、
  // 「設定する/変更する」ボタンを持つformを起点にスコープを絞って操作する。
  const secretWordForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: /^(設定する|変更する)$/ }) });
  await secretWordForm.locator('input[type="password"]').fill(E2E_USER.password);
  await secretWordForm.locator('input[type="text"]').fill(secretWord);
  await secretWordForm.getByRole("button", { name: /^(設定する|変更する)$/ }).click();
  await expect(page.getByText(/秘密の言葉を(設定|変更)しました/)).toBeVisible();
}

test("秘密の言葉によるパスワード再設定 → 新パスワードでログインできる", async ({ page }) => {
  await login(page);
  await setSecretWord(page, "わたしのひみつ");
  await logout(page);

  await page.goto("/forgot-password");
  await page.getByLabel("登録済みメールアドレス").fill(E2E_USER.email);
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByLabel("秘密の言葉").fill("わたしのひみつ");
  await page.getByRole("button", { name: "次へ" }).click();

  const newPassword = "NewE2ETestPass456!";
  await page.locator("#password").fill(newPassword);
  await page.locator("#confirmPassword").fill(newPassword);
  await page.getByRole("button", { name: "パスワードを変更する" }).click();

  await expect(page).toHaveURL(/\/login\?message=password_reset/);

  await page.getByLabel("メールアドレス").fill(E2E_USER.email);
  await page.getByLabel("パスワード", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
});

test("秘密の言葉が間違っている場合はパスワード再設定に進めない", async ({ page }) => {
  await login(page);
  await setSecretWord(page, "わたしのひみつ");
  await logout(page);

  await page.goto("/forgot-password");
  await page.getByLabel("登録済みメールアドレス").fill(E2E_USER.email);
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByLabel("秘密の言葉").fill("ちがうことば");
  await page.getByRole("button", { name: "次へ" }).click();

  await expect(page.getByText("秘密の言葉が正しくありません。")).toBeVisible();
});

test("未登録メールアドレスでのログインは失敗する", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("not-registered@example.com");
  await page.getByLabel("パスワード", { exact: true }).fill("SomePassword123!");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  await expect(
    page.getByText("メールアドレスまたはパスワードが正しくありません。")
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("パスワード誤入力を10回連続するとアカウントがロックされ、ロック中はログインできない", async ({
  page,
}) => {
  await page.goto("/login");

  for (let i = 0; i < 10; i++) {
    await page.getByLabel("メールアドレス").fill(E2E_USER.email);
    await page.getByLabel("パスワード", { exact: true }).fill("WrongPassword999!");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByText(/正しくありません|ロックされています/)).toBeVisible();
  }

  await expect(page.getByText("アカウントがロックされています。しばらくお待ちください。")).toBeVisible();

  // ロック中は正しいパスワードでもログインできない
  await page.getByLabel("メールアドレス").fill(E2E_USER.email);
  await page.getByLabel("パスワード", { exact: true }).fill(E2E_USER.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByText("アカウントがロックされています。しばらくお待ちください。")).toBeVisible();
});

test("未ログイン状態で保護ページに直接アクセスするとログインへリダイレクトされる", async ({
  page,
}) => {
  await page.goto("/books");
  await expect(page).toHaveURL(/\/login/);
});

test("一般ユーザーが管理画面URLに直接アクセスするとトップへリダイレクトされる", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});
