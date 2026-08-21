import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

// スタブカーリルAPI（e2e/fixtures/external/calil-library.json,
// calil-check.json）は常に「文京区立図書館」(systemid: Tokyo_Bunkyo) 1件を
// 返す固定フィクスチャ。貸出状況はISBN 9784101010014のみ「貸出可」が登録されている。
const STUB_LIBRARY_SYSTEMID = "Tokyo_Bunkyo";
// 検索結果カード・登録済み一覧の表示名は calil-library.json の `formal` を使う
const STUB_LIBRARY_FORMAL_NAME = "スタブ図書館";
// 登録完了メッセージ・在庫確認モーダルの表示名は `systemname` を使う
const STUB_LIBRARY_SYSTEM_NAME = "文京区立図書館";
const STUB_ISBN = "9784101010014";
const STUB_TITLE = "吾輩は猫である";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

test.describe("図書館登録（設定画面）", () => {
  test("都道府県を選択して検索し、結果から図書館を登録・削除できる", async ({ page }) => {
    await login(page);
    await page.goto("/settings");

    const librarySection = page.locator("form").filter({ has: page.getByRole("button", { name: "図書館を検索" }) });
    await librarySection.getByRole("combobox").selectOption("東京都");
    await librarySection.getByRole("button", { name: "図書館を検索" }).click();

    await expect(page.getByText(STUB_LIBRARY_FORMAL_NAME)).toBeVisible();
    await page.getByRole("button", { name: "追加" }).click();
    await expect(page.getByText(`「${STUB_LIBRARY_SYSTEM_NAME}」を登録しました`)).toBeVisible();
    await expect(page.getByText("登録済み", { exact: true })).toBeVisible();

    const registered = await testPrisma.userLibrary.findMany({
      where: { systemid: STUB_LIBRARY_SYSTEMID },
    });
    expect(registered).toHaveLength(1);

    await page.getByLabel("削除").click();
    await expect(page.getByText("まだ登録されていません")).toBeVisible();
    const afterDelete = await testPrisma.userLibrary.findMany({
      where: { systemid: STUB_LIBRARY_SYSTEMID },
    });
    expect(afterDelete).toHaveLength(0);
  });

  test("都道府県未選択のままでは検索ボタンが無効化される", async ({ page }) => {
    await login(page);
    await page.goto("/settings");

    const librarySection = page.locator("form").filter({ has: page.getByRole("button", { name: "図書館を検索" }) });
    await expect(librarySection.getByRole("button", { name: "図書館を検索" })).toBeDisabled();
  });

  test("5館登録済みの場合、検索して追加する欄が表示されない", async ({ page }) => {
    await login(page);
    const session = await testPrisma.user.findUniqueOrThrow({
      where: { email: "e2e-test@example.com" },
    });
    await testPrisma.userLibrary.createMany({
      data: Array.from({ length: 5 }).map((_, i) => ({
        userId: session.id,
        systemid: `Stub_Lib_${i}`,
        libkey: "図書館",
        name: `スタブ図書館${i}`,
        pref: "東京都",
        city: null,
      })),
    });

    await page.goto("/settings");
    await expect(page.getByText("登録済みの図書館（最大5館）")).toBeVisible();
    await expect(page.getByText("図書館を検索して追加")).not.toBeVisible();
  });

  test("カーリル図書館検索APIがエラーを返す場合、検索失敗のメッセージが表示される", async ({
    page,
  }) => {
    await page.route("**/api/calil/libraries*", async (route) => {
      await route.fulfill({ status: 500, json: { error: "internal" } });
    });

    await login(page);
    await page.goto("/settings");

    const librarySection = page.locator("form").filter({ has: page.getByRole("button", { name: "図書館を検索" }) });
    await librarySection.getByRole("combobox").selectOption("東京都");
    await librarySection.getByRole("button", { name: "図書館を検索" }).click();

    await expect(page.getByText("図書館の検索に失敗しました")).toBeVisible();
  });
});

test.describe("在庫確認モーダル（本詳細ページ）", () => {
  async function seedBookWithStubIsbn() {
    const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
    return testPrisma.book.create({
      data: {
        title: STUB_TITLE,
        authorId: author.id,
        isbn: STUB_ISBN,
        publishedAt: new Date("1990-04-01"),
      },
    });
  }

  test("図書館を1件も登録していない場合、登録を促すメッセージが表示される", async ({ page }) => {
    const book = await seedBookWithStubIsbn();
    await login(page);
    await page.goto(`/books/${book.id}`);
    await page.getByRole("button", { name: "登録されている版ごとの在庫を見る" }).click();

    await expect(page.getByText("近隣図書館が登録されていません")).toBeVisible();
  });

  test("図書館登録済みの場合、ISBNごとの貸出状況と予約リンクが表示される", async ({ page }) => {
    const book = await seedBookWithStubIsbn();
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: "e2e-test@example.com" },
    });
    await testPrisma.userLibrary.create({
      data: {
        userId: user.id,
        systemid: STUB_LIBRARY_SYSTEMID,
        libkey: "図書館",
        name: STUB_LIBRARY_FORMAL_NAME,
        pref: "東京都",
        city: "文京区",
      },
    });

    await login(page);
    await page.goto(`/books/${book.id}`);
    await page.getByRole("button", { name: "登録されている版ごとの在庫を見る" }).click();

    await expect(page.getByText(`ISBN: ${STUB_ISBN}`)).toBeVisible();
    await expect(page.getByText("貸出可")).toBeVisible();
    const reserveLink = page.getByRole("link", { name: /予約する/ });
    await expect(reserveLink).toBeVisible();
    await expect(reserveLink).toHaveAttribute("target", "_blank");
  });

  test("ISBNが登録されていない本では、その旨のメッセージが表示される", async ({ page }) => {
    const author = await testPrisma.author.create({ data: { name: "無名の著者" } });
    const book = await testPrisma.book.create({
      data: {
        title: "ISBN未登録の本",
        authorId: author.id,
        isbn: null,
        publishedAt: new Date("2020-01-01"),
      },
    });
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: "e2e-test@example.com" },
    });
    await testPrisma.userLibrary.create({
      data: {
        userId: user.id,
        systemid: STUB_LIBRARY_SYSTEMID,
        libkey: "図書館",
        name: STUB_LIBRARY_FORMAL_NAME,
        pref: "東京都",
        city: "文京区",
      },
    });

    await login(page);
    await page.goto(`/books/${book.id}`);
    await page.getByRole("button", { name: "登録されている版ごとの在庫を見る" }).click();

    await expect(page.getByText("この本にはISBNが登録されていません")).toBeVisible();
  });

  test("カーリルAPI（自アプリのcheck-book）がエラーを返す場合、確認失敗のメッセージが表示される", async ({
    page,
  }) => {
    const book = await seedBookWithStubIsbn();
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: "e2e-test@example.com" },
    });
    await testPrisma.userLibrary.create({
      data: {
        userId: user.id,
        systemid: STUB_LIBRARY_SYSTEMID,
        libkey: "図書館",
        name: STUB_LIBRARY_FORMAL_NAME,
        pref: "東京都",
        city: "文京区",
      },
    });

    await page.route("**/api/calil/check-book*", async (route) => {
      await route.fulfill({ status: 500, json: { error: "internal" } });
    });

    await login(page);
    await page.goto(`/books/${book.id}`);
    await page.getByRole("button", { name: "登録されている版ごとの在庫を見る" }).click();

    await expect(page.getByText("確認に失敗しました")).toBeVisible();
  });
});
