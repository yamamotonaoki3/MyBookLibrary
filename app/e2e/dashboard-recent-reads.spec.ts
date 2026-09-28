import { expect, test } from "@playwright/test";
import { E2E_USER, seedE2e } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

test("ダッシュボードの読書記録で最近の本を表示し、ステータスを更新できる", async ({ page }) => {
  const user = await testPrisma.user.findUniqueOrThrow({
    where: { email: E2E_USER.email },
  });
  const author = await testPrisma.author.create({
    data: { name: "ダッシュボード著者" },
  });
  const book = await testPrisma.book.create({
    data: {
      title: "ダッシュボード読書記録テスト",
      authorId: author.id,
      publishedAt: new Date("2024-01-02T00:00:00.000Z"),
    },
  });
  await testPrisma.readingStatus.create({
    data: { userId: user.id, bookId: book.id, status: "reading" },
  });

  await login(page);

  const record = page.getByRole("link", { name: book.title, exact: true }).locator("xpath=ancestor::li[1]");
  await expect(record).toBeVisible();
  await expect(record.getByText(author.name, { exact: true })).toBeVisible();
  await expect(record.getByRole("button", { name: "読書中" })).toHaveClass(/bg-blue-600/);

  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/reading-status") && response.request().method() === "POST"
    ),
    record.getByRole("button", { name: "読了" }).click(),
  ]);
  await expect(record.getByRole("button", { name: "読了" })).toHaveClass(/bg-green-600/);

  await expect.poll(async () => {
    const status = await testPrisma.readingStatus.findUniqueOrThrow({
      where: { userId_bookId: { userId: user.id, bookId: book.id } },
    });
    return status.status;
  }).toBe("read");
});
