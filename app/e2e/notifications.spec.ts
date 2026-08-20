import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

async function createOtherUser(nameSuffix = "") {
  const passwordHash = await bcrypt.hash("OtherUserPass123!", 12);
  return testPrisma.user.create({
    data: {
      name: `通知テスト相手${nameSuffix}`,
      email: `e2e-notif-other${nameSuffix}@example.com`,
      password: passwordHash,
      role: "user",
    },
  });
}

test("フォローされると通知が生成され、一覧に表示・クリックで既読化される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();

  // 相手が自分をフォローしたケースを再現する
  await testPrisma.follow.create({ data: { followerId: other.id, followingId: me.id } });
  await testPrisma.notification.create({
    data: {
      userId: me.id,
      type: "follow",
      content: `${other.name}さんにフォローされました。フォローバックしますか？`,
      actorId: other.id,
    },
  });

  await login(page);
  await page.goto("/notifications");
  await expect(page.getByText(`${other.name}さんにフォローされました`)).toBeVisible();
  await expect(page.getByText("未読")).toBeVisible();

  await page.getByText(`${other.name}さんにフォローされました`).click();
  await expect(page).toHaveURL(new RegExp(`/users/${other.id}$`));

  const notification = await testPrisma.notification.findFirstOrThrow({
    where: { userId: me.id, type: "follow" },
  });
  expect(notification.isRead).toBe(true);
});

test("相互フォロー相手のお気に入り著者追加で「著者」バッジの通知が届く", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();
  await testPrisma.follow.create({ data: { followerId: me.id, followingId: other.id } });
  await testPrisma.follow.create({ data: { followerId: other.id, followingId: me.id } });

  await testPrisma.notification.create({
    data: {
      userId: me.id,
      type: "mutual_favorite_author",
      content: `${other.name}さんがお気に入り著者に「テスト著者」を追加しました。`,
      actorId: other.id,
    },
  });

  await login(page);
  await page.goto("/notifications");

  await expect(page.getByRole("listitem").getByText("著者", { exact: true })).toBeVisible();
  await expect(page.getByText("お気に入り著者に「テスト著者」を追加しました。")).toBeVisible();
});

test("相互フォロー相手の読みたい本追加で「読みたい本」バッジの通知が届く", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();
  await testPrisma.follow.create({ data: { followerId: me.id, followingId: other.id } });
  await testPrisma.follow.create({ data: { followerId: other.id, followingId: me.id } });

  await testPrisma.notification.create({
    data: {
      userId: me.id,
      type: "mutual_want_to_read",
      content: `${other.name}さんが「テスト本」を読みたい本に追加しました。`,
      actorId: other.id,
      bookTitle: "テスト本",
    },
  });

  await login(page);
  await page.goto("/notifications");

  await expect(page.getByText("読みたい本", { exact: true })).toBeVisible();
  await expect(page.getByText("を読みたい本に追加しました。")).toBeVisible();
});

test("すべて既読にするボタンで未読通知を一括既読化できる", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();
  await testPrisma.notification.createMany({
    data: [
      { userId: me.id, type: "follow", content: "通知1件目です。", actorId: other.id },
      { userId: me.id, type: "follow", content: "通知2件目です。", actorId: other.id },
    ],
  });

  await login(page);
  await page.goto("/notifications");
  await expect(page.getByText("未読").first()).toBeVisible();

  await page.getByRole("button", { name: "すべて既読にする" }).click();
  await expect(page.getByText("未読")).toHaveCount(0);

  const unread = await testPrisma.notification.count({ where: { userId: me.id, isRead: false } });
  expect(unread).toBe(0);
});

test("通知が1件も無い場合、その旨のメッセージが表示される", async ({ page }) => {
  await login(page);
  await page.goto("/notifications");
  await expect(page.getByText("通知はありません。")).toBeVisible();
});

test("新刊通知(cron)：登録済みお気に入り著者の新刊がスタブ楽天APIから検知され通知される", async ({
  page,
}) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
  await testPrisma.favoriteAuthor.create({ data: { userId: me.id, authorId: author.id, notify: true } });

  await login(page);
  const res = await page.request.get("/api/cron/check-new-books", {
    headers: { Authorization: "Bearer dummy-test-cron-secret"},
  });
  const body = await res.json();
  expect(res.ok()).toBe(true);
  expect(body.created).toBeGreaterThan(0);

  await page.goto("/notifications");
  await expect(page.getByText("新刊", { exact: true })).toBeVisible();
  await expect(
    page.getByText("夏目漱石 の新刊「吾輩は猫である」が発売予定です")
  ).toBeVisible();

  // 同じ新刊に対して再度実行しても重複通知は作成されない
  const secondRes = await page.request.get("/api/cron/check-new-books", {
    headers: { Authorization: "Bearer dummy-test-cron-secret"},
  });
  const secondBody = await secondRes.json();
  expect(secondBody.created).toBe(0);
});

test("CRON_SECRETが一致しない場合、401が返り通知は作成されない", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });
  await testPrisma.favoriteAuthor.create({ data: { userId: me.id, authorId: author.id, notify: true } });

  await login(page);
  const res = await page.request.get("/api/cron/check-new-books", {
    headers: { Authorization: "Bearer wrong-secret" },
  });
  expect(res.status()).toBe(401);

  const notifications = await testPrisma.notification.findMany({
    where: { userId: me.id, type: "new_book" },
  });
  expect(notifications).toHaveLength(0);
});
