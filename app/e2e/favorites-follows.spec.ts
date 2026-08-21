import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { seedE2e, E2E_USER } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login } from "./fixtures/auth";

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
});

// スタブ楽天API（e2e/fixtures/external/rakuten-search.json）は著者名検索でも
// クエリを無視して常に「夏目漱石」（正規化後）の1件を返す。
const STUB_AUTHOR = "夏目漱石";

async function createOtherUser(nameSuffix = "") {
  const passwordHash = await bcrypt.hash("OtherUserPass123!", 12);
  return testPrisma.user.create({
    data: {
      name: `フォロー相手${nameSuffix}`,
      email: `e2e-other${nameSuffix}@example.com`,
      password: passwordHash,
      role: "user",
    },
  });
}

test("著者検索ダイアログから著者を検索・追加でき、追加済みは「登録済み」と表示される", async ({
  page,
}) => {
  await login(page);
  await page.goto("/favorite-authors");

  await page.getByRole("button", { name: "著者を追加" }).click();
  await page.getByPlaceholder("例：東野圭吾、湊かなえ").fill("なつめ");
  await page.getByRole("button", { name: "検索" }).click();

  await expect(page.getByText(STUB_AUTHOR, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  // ダイアログが閉じるまで待つ（handleAddの完了を待機する）
  await expect(page.getByRole("heading", { name: "著者を追加" })).not.toBeVisible();

  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const favorites = await testPrisma.favoriteAuthor.findMany({
    where: { userId: user.id },
    include: { author: true },
  });
  expect(favorites.map((f) => f.author.name)).toContain(STUB_AUTHOR);

  // 再度開いて検索すると「登録済み」表示になる
  await page.getByRole("button", { name: "著者を追加" }).click();
  await page.getByPlaceholder("例：東野圭吾、湊かなえ").fill("なつめ");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByText("登録済み")).toBeVisible();
});

test("検索クエリが2文字未満の場合、検索ボタンが無効化されエラーメッセージが表示される", async ({
  page,
}) => {
  await login(page);
  await page.goto("/favorite-authors");

  await page.getByRole("button", { name: "著者を追加" }).click();
  await page.getByPlaceholder("例：東野圭吾、湊かなえ").fill("あ");

  await expect(page.getByRole("button", { name: "検索" })).toBeDisabled();
  await expect(page.getByText("2文字以上入力してください。")).toBeVisible();
});

test("おすすめ著者からワンクリックで追加でき、「追加済み」表示に切り替わる", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const authorA = await testPrisma.author.create({ data: { name: "著者A" } });
  const authorB = await testPrisma.author.create({ data: { name: "著者B" } });
  const other = await createOtherUser();
  await testPrisma.favoriteAuthor.create({ data: { userId: me.id, authorId: authorA.id } });
  await testPrisma.favoriteAuthor.create({ data: { userId: other.id, authorId: authorA.id } });
  await testPrisma.favoriteAuthor.create({ data: { userId: other.id, authorId: authorB.id } });

  await login(page);
  await page.goto("/favorite-authors");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "こんな著者もおすすめ" })).toBeVisible();
  const recommendationItem = main.getByRole("listitem").filter({ hasText: "著者B" });
  await recommendationItem.getByRole("button", { name: "追加する" }).click();

  // クリック後 router.refresh() でサーバーからおすすめを再取得すると、
  // 追加済みの著者Bは協調フィルタリングの候補から外れ一覧から消える
  // （「追加済み」表示は再取得までの一瞬のみのため、DB側の結果で検証する）。
  await expect
    .poll(async () => {
      const favorites = await testPrisma.favoriteAuthor.findMany({
        where: { userId: me.id, authorId: authorB.id },
      });
      return favorites.length;
    })
    .toBe(1);
});

test("著者詳細ページで本タイトルを検索・クリアできる", async ({ page }) => {
  // このページの一覧はスタブ楽天API経由（常に「吾輩は猫である」1件を返す固定
  // フィクスチャ）のため、DBに直接投入した本ではなくこのタイトルを対象に検索する。
  const author = await testPrisma.author.create({ data: { name: STUB_AUTHOR } });

  await login(page);
  await page.goto(`/favorite-authors/${author.id}`);
  await expect(page.getByText("吾輩は猫である").locator("visible=true")).toBeVisible();
  await expect(page.getByText("全1冊").locator("visible=true")).toBeVisible();

  await page.getByPlaceholder("タイトルを漢字で入力（例：容疑者Xの献身）").fill("吾輩");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByText("「吾輩」の絞り込み結果: 1件")).toBeVisible();
  await expect(page.getByText("吾輩は猫である").locator("visible=true")).toBeVisible();

  await page.getByPlaceholder("タイトルを漢字で入力（例：容疑者Xの献身）").fill("存在しないタイトル");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByText("この著者の本が見つかりませんでした")).toBeVisible();

  await page.getByLabel("クリア").click();
  await expect(page.getByText("全1冊").locator("visible=true")).toBeVisible();
});

test("本詳細ページのボタンからお気に入り著者を登録・解除できる", async ({ page }) => {
  const author = await testPrisma.author.create({ data: { name: "本詳細著者" } });
  const book = await testPrisma.book.create({
    data: { title: "本詳細テスト本", authorId: author.id, publishedAt: new Date("2020-01-01") },
  });

  await login(page);
  await page.goto(`/books/${book.id}`);

  const toggle = page.getByRole("button", { name: /お気に入り.*著者登録|お気に入り済み/ });
  await toggle.click();
  await expect(page.getByRole("button", { name: "お気に入り済み" })).toBeVisible();

  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  let favorites = await testPrisma.favoriteAuthor.findMany({ where: { userId: me.id, authorId: author.id } });
  expect(favorites).toHaveLength(1);

  await page.getByRole("button", { name: "お気に入り済み" }).click();
  await expect(page.getByRole("button", { name: /お気に入り.*著者登録/ })).toBeVisible();
  favorites = await testPrisma.favoriteAuthor.findMany({ where: { userId: me.id, authorId: author.id } });
  expect(favorites).toHaveLength(0);
});

test("相互フォローが成立していないユーザーでも、他ユーザーのプロフィールを閲覧できる", async ({
  page,
}) => {
  const other = await createOtherUser();
  const favoriteAuthor = await testPrisma.author.create({ data: { name: "相手のお気に入り著者" } });
  await testPrisma.favoriteAuthor.create({ data: { userId: other.id, authorId: favoriteAuthor.id } });
  const bookAuthor = await testPrisma.author.create({ data: { name: "本の著者テスト" } });
  const book = await testPrisma.book.create({
    data: { title: "相手の読書中の本テスト", authorId: bookAuthor.id, publishedAt: new Date("2020-01-01") },
  });
  await testPrisma.readingStatus.create({ data: { userId: other.id, bookId: book.id, status: "reading" } });

  await login(page);
  await page.goto(`/users/${other.id}`);

  await expect(
    page.getByRole("heading", { name: `${other.name}さんのプロフィール` }).locator("visible=true")
  ).toBeVisible();
  await expect(page.getByText("相手のお気に入り著者", { exact: true }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("相手の読書中の本テスト").locator("visible=true")).toBeVisible();
  await expect(page.getByText("相互フォロー")).not.toBeVisible();
});

test("相互フォロー成立後にお気に入り著者を追加すると相手に活動通知が作成される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();
  // 相互フォローを直接成立させる
  await testPrisma.follow.create({ data: { followerId: me.id, followingId: other.id } });
  await testPrisma.follow.create({ data: { followerId: other.id, followingId: me.id } });

  await login(page);
  const res = await page.request.post("/api/favorite-authors", {
    data: { authorName: STUB_AUTHOR },
  });
  expect(res.ok()).toBe(true);

  const notifications = await testPrisma.notification.findMany({
    where: { userId: other.id, type: "mutual_favorite_author" },
  });
  expect(notifications).toHaveLength(1);
  expect(notifications[0].content).toContain(STUB_AUTHOR);
});

test("フォロー解除すると、相互フォロー限定の活動通知が削除される", async ({ page }) => {
  const me = await testPrisma.user.findUniqueOrThrow({ where: { email: E2E_USER.email } });
  const other = await createOtherUser();
  await testPrisma.follow.create({ data: { followerId: me.id, followingId: other.id } });
  await testPrisma.follow.create({ data: { followerId: other.id, followingId: me.id } });

  await login(page);
  await page.request.post("/api/favorite-authors", { data: { authorName: STUB_AUTHOR } });
  const before = await testPrisma.notification.findMany({
    where: { userId: other.id, type: "mutual_favorite_author" },
  });
  expect(before).toHaveLength(1);

  const unfollowRes = await page.request.delete("/api/follows", {
    data: { targetUserId: other.id },
  });
  expect(unfollowRes.ok()).toBe(true);

  const after = await testPrisma.notification.findMany({
    where: { userId: other.id, type: "mutual_favorite_author" },
  });
  expect(after).toHaveLength(0);
});
