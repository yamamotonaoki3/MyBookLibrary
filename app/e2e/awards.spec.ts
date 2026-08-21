import { test, expect } from "@playwright/test";
import { seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function seedAward() {
  const author = await testPrisma.author.create({ data: { name: "直木賞著者" } });
  const award = await testPrisma.award.create({ data: { name: "直木賞" } });
  const winnerBook = await testPrisma.book.create({
    data: {
      title: "受賞作テスト本",
      authorId: author.id,
      isbn: "9780000000001",
      publishedAt: new Date("2023-01-01"),
    },
  });
  const nomineeBook = await testPrisma.book.create({
    data: {
      title: "ノミネート作テスト本",
      authorId: author.id,
      isbn: "9780000000002",
      publishedAt: new Date("2023-01-01"),
    },
  });
  await testPrisma.awardEntry.create({
    data: { bookId: winnerBook.id, awardId: award.id, year: 2023, type: "winner" },
  });
  await testPrisma.awardEntry.create({
    data: { bookId: nomineeBook.id, awardId: award.id, year: 2023, type: "nominee" },
  });
  return { award, winnerBook, nomineeBook };
}

test("賞タブを切り替えて作品一覧を表示できる", async ({ page }) => {
  const { award, winnerBook, nomineeBook } = await seedAward();

  await login(page);
  await page.goto("/awards");
  await page.getByRole("button", { name: award.name }).click();
  await expect(page).toHaveURL(new RegExp(`awardId=${award.id}`));

  await expect(page.getByRole("heading", { name: winnerBook.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: nomineeBook.title })).toBeVisible();
  await expect(page.getByText("受賞", { exact: true }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("ノミネート", { exact: true }).locator("visible=true")).toBeVisible();
});

test("受賞作の読書進捗（読了数/全体数）が表示される", async ({ page }) => {
  const { award, winnerBook } = await seedAward();
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "e2e-test@example.com" } });
  await testPrisma.readingStatus.create({
    data: { userId: user.id, bookId: winnerBook.id, status: "read" },
  });

  await login(page);
  await page.goto(`/awards?awardId=${award.id}`);

  await expect(page.getByText("進捗:")).toBeVisible();
  await expect(page.getByText("1 / 2冊")).toBeVisible();
  await expect(page.getByText("(50%)")).toBeVisible();
});

test("該当する作品が無い年度で絞り込むと、その旨のメッセージが表示される", async ({ page }) => {
  const { award } = await seedAward();

  await login(page);
  // 実在しない年度をURLパラメータで直接指定する（存在しない絞り込み条件の代表例）
  await page.goto(`/awards?awardId=${award.id}&year=1999`);

  await expect(
    page.getByText("該当する作品が見つかりませんでした。").locator("visible=true")
  ).toBeVisible();
});

test("賞が1件も登録されていない場合、その旨のメッセージが表示される", async ({ page }) => {
  await login(page);
  await page.goto("/awards");

  await expect(page.getByText("賞データが登録されていません。")).toBeVisible();
});
