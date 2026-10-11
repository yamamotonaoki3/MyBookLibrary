import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

// 著者詳細（スタブ楽天APIが常に「吾輩は猫である」1件を返す）と受賞一覧の
// 読書ステータスボタン（保存中表示・連打・失敗時の巻き戻し・レイアウトずれなし）を検証する。
const STUB_AUTHOR = "夏目漱石";
const STUB_TITLE = "吾輩は猫である";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

function cardOf(page: Page, title: string): Locator {
  return page
    .locator("div.rounded-lg")
    .filter({ hasText: title })
    .filter({ has: page.getByRole("group", { name: "読書ステータス" }) })
    .filter({ visible: true })
    .last();
}

// カード左上を原点にした座標を返す（スクロール位置や内部スクロール領域の影響を受けない）
async function layoutOf(card: Locator, title: string) {
  return card.evaluate((el, t) => {
    const c = el.getBoundingClientRect();
    const rel = (node: Element | null | undefined) => {
      if (!node) throw new Error("要素が見つかりません");
      const r = node.getBoundingClientRect();
      return { x: r.x - c.x, y: r.y - c.y, width: r.width, height: r.height };
    };
    return {
      box: { x: 0, y: 0, width: c.width, height: c.height },
      // 先頭のリンク／ボタンが書影（未登録の間はボタン、登録後はリンク）
      cover: rel(el.querySelector("a, button")),
      titleBox: rel(
        Array.from(el.querySelectorAll("*")).find(
          (n) => n.children.length === 0 && n.textContent?.trim() === t
        )
      ),
    };
  }, title);
}

function expectSameLayout(
  a: Awaited<ReturnType<typeof layoutOf>>,
  b: Awaited<ReturnType<typeof layoutOf>>
) {
  for (const key of ["box", "cover", "titleBox"] as const) {
    expect(Math.abs(a[key].height - b[key].height), `${key}.height`).toBeLessThanOrEqual(1);
    expect(Math.abs(a[key].width - b[key].width), `${key}.width`).toBeLessThanOrEqual(1);
    expect(Math.abs(a[key].y - b[key].y), `${key}.y`).toBeLessThanOrEqual(1);
    expect(Math.abs(a[key].x - b[key].x), `${key}.x`).toBeLessThanOrEqual(1);
  }
}

async function delayReadingStatusApi(page: Page, ms: number) {
  await page.route("**/api/reading-status", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

async function seedFavoriteAuthorPage(page: Page) {
  const author = await testPrisma.author.create({ data: { name: STUB_AUTHOR } });
  await login(page);
  await page.goto(`/favorite-authors/${author.id}`);
  await expect(cardOf(page, STUB_TITLE)).toBeVisible();
  // 非同期で描画される領域が落ち着き、カードの幅が確定してからレイアウトを測定する
  await page.waitForLoadState("networkidle");
}

test.describe("著者詳細の本カード（未登録の本）", () => {
  test("応答が遅くても保存中の表示が出て、連打した最後のステータスが保存される", async ({ page }) => {
    await seedFavoriteAuthorPage(page);
    await delayReadingStatusApi(page, 1500);
    const card = cardOf(page, STUB_TITLE);

    await card.getByRole("button", { name: "読みたい" }).click();
    await expect(card.getByText("本の情報を取得中")).toBeVisible();
    await expect(card.getByRole("button", { name: "読みたい" })).toHaveAttribute("aria-busy", "true");

    // 保存中に連打する（途中の値は捨てられ、最後に押した値が反映される）
    await card.getByRole("button", { name: "読書中" }).click();
    await card.getByRole("button", { name: "読了" }).click();
    await expect(card.getByRole("button", { name: "読了" })).toHaveAttribute("aria-pressed", "true");

    await expect(card.getByText("本の情報を取得中")).toBeHidden({ timeout: 15_000 });
    await expect(card.getByRole("link", { name: "感想を書く" })).toBeVisible();

    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
    await expect
      .poll(async () => (await testPrisma.readingStatus.findFirst({ where: { userId: user.id } }))?.status)
      .toBe("read");
  });

  test("ステータス変更の前後（保存中・完了後）でカードのレイアウトがずれない", async ({ page }) => {
    await seedFavoriteAuthorPage(page);
    await delayReadingStatusApi(page, 1000);
    const card = cardOf(page, STUB_TITLE);

    const before = await layoutOf(card, STUB_TITLE);

    await card.getByRole("button", { name: "読了" }).click();
    await expect(card.getByText("本の情報を取得中")).toBeVisible();
    expectSameLayout(before, await layoutOf(card, STUB_TITLE));

    // 完了後: タイトル・書影がリンクに切り替わり、「感想を書く」チップが出る
    await expect(card.getByRole("link", { name: "感想を書く" })).toBeVisible({ timeout: 15_000 });
    expectSameLayout(before, await layoutOf(card, STUB_TITLE));

    await card.getByRole("button", { name: "未読" }).click();
    await expect(card.getByRole("link", { name: "感想を書く" })).toBeHidden();
    await expect(card.getByText("保存中…")).toBeHidden({ timeout: 15_000 });
    expectSameLayout(before, await layoutOf(card, STUB_TITLE));
  });

  test("保存に失敗するとエラーが表示され、ステータス表示が元に戻る", async ({ page }) => {
    await seedFavoriteAuthorPage(page);
    await page.route("**/api/reading-status", (route) =>
      route.fulfill({ status: 500, json: { error: "Internal Server Error" } })
    );
    const card = cardOf(page, STUB_TITLE);

    await card.getByRole("button", { name: "読書中" }).click();

    await expect(card.getByRole("alert")).toContainText("保存に失敗しました");
    await expect(card.getByRole("button", { name: "未読" })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "読書中" })).toHaveAttribute("aria-pressed", "false");
    // 保存中表示が解除され、再度操作できる
    await expect(card.getByRole("button", { name: "読書中" })).not.toHaveAttribute("aria-busy", "true");
  });
});

test.describe("受賞一覧の本カード", () => {
  async function openAwardsPage(page: Page) {
    const author = await testPrisma.author.create({ data: { name: "testuser_award_author" } });
    const award = await testPrisma.award.create({ data: { name: "[E2E_TEST] 賞" } });
    const book = await testPrisma.book.create({
      data: {
        title: "[E2E_TEST] 受賞作",
        authorId: author.id,
        isbn: "9780000000101",
        publishedAt: new Date("2023-01-01"),
      },
    });
    await testPrisma.awardEntry.create({
      data: { bookId: book.id, awardId: award.id, year: 2023, type: "winner" },
    });
    await login(page);
    await page.goto(`/awards?awardId=${award.id}`);
    await expect(cardOf(page, book.title)).toBeVisible();
    await page.waitForLoadState("networkidle");
    return book;
  }

  test("保存中の表示が出て、ステータス変更でレイアウトがずれない", async ({ page }) => {
    const book = await openAwardsPage(page);
    await delayReadingStatusApi(page, 1000);
    const card = cardOf(page, book.title);
    const before = await layoutOf(card, book.title);

    await card.getByRole("button", { name: "読書中" }).click();
    await expect(card.getByText("保存中…")).toBeVisible();
    await expect(card.getByRole("button", { name: "読書中" })).toHaveAttribute("aria-busy", "true");
    expectSameLayout(before, await layoutOf(card, book.title));

    await expect(card.getByText("保存中…")).toBeHidden({ timeout: 15_000 });
    await expect(card.getByRole("link", { name: "感想を書く" })).toBeVisible();
    expectSameLayout(before, await layoutOf(card, book.title));
  });

  test("保存に失敗するとエラーが表示され、ステータス表示が元に戻る", async ({ page }) => {
    const book = await openAwardsPage(page);
    await page.route("**/api/reading-status", (route) =>
      route.fulfill({ status: 500, json: { error: "Internal Server Error" } })
    );
    const card = cardOf(page, book.title);

    await card.getByRole("button", { name: "読了" }).click();

    await expect(card.getByRole("alert")).toContainText("保存に失敗しました");
    await expect(card.getByRole("button", { name: "未読" })).toHaveAttribute("aria-pressed", "true");
  });
});
