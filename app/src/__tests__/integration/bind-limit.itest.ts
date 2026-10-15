/**
 * 実DB統合テスト。件数に比例するクエリが、D1 のバインドパラメータの上限（1 クエリ 100 個）を超える件数でも動くことを検証する（#678）。
 * MySQL でも同じ結果になること（挙動が変わらないこと）を、同じテストで確認する。
 */
jest.mock("@/lib/session");

import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { asAdmin, asUser } from "../helpers/sessionMock";
import { routeCtx } from "../helpers";
import { prisma } from "@/lib/prisma";
import { countReadBooks } from "@/lib/readingProgress";
import { getAwardBookEntries } from "@/lib/awardBookList";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { mergeManualBook } from "@/repositories/manualBookRepository";
import { createNotificationsInChunks } from "@/repositories/notificationRepository";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

/** 上限（100 個）を超える件数。 */
const MANY = 150;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const isbnOf = (i: number) => `97800001${String(i).padStart(5, "0")}`;

async function createUsers(count: number, prefix: string) {
  await testPrisma.user.createMany({
    data: range(count).map((i) => ({ name: `${prefix}${i}`, email: `${prefix}${i}@example.com`, role: "user" })),
  });
  return testPrisma.user.findMany({ where: { email: { startsWith: prefix } }, orderBy: { id: "asc" } });
}

async function createBooks(count: number, extra: { createdByUserId?: number; source?: string } = {}) {
  const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
  await testPrisma.book.createMany({
    data: range(count).map((i) => ({
      title: `[E2E_TEST] 本${i}`,
      authorId: author.id,
      isbn: isbnOf(i),
      publishedAt: new Date("2026-01-01"),
      ...extra,
    })),
  });
  return testPrisma.book.findMany({ orderBy: { id: "asc" } });
}

describe("POST /api/admin/import-csv（行数が多い CSV）", () => {
  const csvOf = (awardId: number) =>
    [
      "title,author,isbn,coverImageUrl,publishedAt,awardId,year,type",
      ...range(MANY).map((i) => `本${i},著者${i},${isbnOf(i)},,2020-01-01,${awardId},2020,winner`),
    ].join("\n");

  const upload = async (csv: string) => {
    const { POST } = await import("@/app/api/admin/import-csv/route");
    const formData = new FormData();
    formData.set("file", new File([csv], "import.csv", { type: "text/csv" }));
    return POST(new NextRequest("http://localhost/api/admin/import-csv", { method: "POST", body: formData }));
  };

  it("上限を超える行数でも取り込め、再度取り込んでも本は重複しない", async () => {
    const [admin] = await createUsers(1, "csvadmin");
    const award = await testPrisma.award.create({ data: { name: "テスト賞" } });
    asAdmin(admin.id);

    const first = await upload(csvOf(award.id));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: MANY, errors: [] });
    expect(await testPrisma.book.count()).toBe(MANY);
    expect(await testPrisma.author.count()).toBe(MANY);

    const second = await upload(csvOf(award.id));
    expect((await second.json()).success).toBe(MANY);
    expect(await testPrisma.book.count()).toBe(MANY);
    expect(await testPrisma.author.count()).toBe(MANY);
    expect(await testPrisma.awardEntry.count()).toBe(MANY);
    // 150 行の CSV を 2 回取り込むため、混み合った CI では、既定の 5 秒を超えることがある（#712）
  }, 30_000);
});

describe("countReadBooks", () => {
  it("上限を超える冊数でも、読了の冊数を正しく数える（重複した本は 1 冊）", async () => {
    const [user] = await createUsers(1, "reader");
    const books = await createBooks(MANY);
    await testPrisma.readingStatus.createMany({
      data: books.map((b, i) => ({ userId: user.id, bookId: b.id, status: i % 2 === 0 ? "read" : "reading" })),
    });

    const ids = books.map((b) => b.id);
    expect(await countReadBooks(user.id, ids)).toBe(MANY / 2);
    expect(await countReadBooks(user.id, [...ids, ...ids])).toBe(MANY / 2);
    expect(await countReadBooks(user.id, [])).toBe(0);
  });
});

describe("getMutualFollowerIds", () => {
  it("フォロー数が上限を超えていても、相互フォローの相手だけを返す", async () => {
    const [me, ...others] = await createUsers(MANY + 1, "follow");
    await testPrisma.follow.createMany({ data: others.map((u) => ({ followerId: me.id, followingId: u.id })) });
    const mutual = others.slice(0, 120);
    await testPrisma.follow.createMany({ data: mutual.map((u) => ({ followerId: u.id, followingId: me.id })) });

    const ids = await getMutualFollowerIds(me.id);

    expect([...ids].sort((a, b) => a - b)).toEqual(mutual.map((u) => u.id).sort((a, b) => a - b));
  });
});

describe("createNotificationsInChunks", () => {
  it("上限を超える件数の通知でも、すべて作成する", async () => {
    const users = await createUsers(MANY, "notify");

    const created = await createNotificationsInChunks(
      users.map((u) => ({ userId: u.id, type: "report", content: "[E2E_TEST] 通報", bookTitle: "本" }))
    );

    expect(created).toBe(MANY);
    expect(await testPrisma.notification.count()).toBe(MANY);
  });
});

describe("mergeManualBook（受賞登録が多い本の統合）", () => {
  it("上限を超える組み合わせの受賞登録が重複していても、統合できる", async () => {
    const [source, target] = await createBooks(2);
    await testPrisma.award.createMany({ data: range(MANY).map((i) => ({ name: `[E2E_TEST] 賞${i}` })) });
    const awards = await testPrisma.award.findMany();
    // 統合先は全件、統合元は先頭 100 件が重複、残りは統合先に付け替わる
    await testPrisma.awardEntry.createMany({ data: awards.map((a) => ({ bookId: target.id, awardId: a.id, year: 2020, type: "winner" })) });
    await testPrisma.awardEntry.createMany({ data: awards.slice(0, 100).map((a) => ({ bookId: source.id, awardId: a.id, year: 2020, type: "winner" })) });
    await testPrisma.awardEntry.create({ data: { bookId: source.id, awardId: awards[0].id, year: 2021, type: "nominee" } });

    await mergeManualBook({ sourceBookId: source.id, targetBookId: target.id });

    expect(await testPrisma.book.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await testPrisma.awardEntry.count({ where: { bookId: target.id } })).toBe(MANY + 1);
  });
});

describe("DELETE /api/books/[id]（感想が多い本の削除）", () => {
  it("上限を超える件数の感想・いいね・通報があっても削除できる", async () => {
    const { DELETE } = await import("@/app/api/books/[id]/route");
    const [owner, ...users] = await createUsers(MANY + 1, "delete");
    const [book] = await createBooks(1, { createdByUserId: owner.id, source: "manual" });
    await testPrisma.review.createMany({
      data: users.map((u) => ({ userId: u.id, bookId: book.id, body: "[E2E_TEST] 感想です。十分な長さの文章です。" })),
    });
    const reviews = await testPrisma.review.findMany({ where: { bookId: book.id } });
    await testPrisma.like.createMany({ data: reviews.map((r) => ({ userId: owner.id, reviewId: r.id })) });
    await testPrisma.report.createMany({ data: reviews.map((r) => ({ userId: owner.id, reviewId: r.id })) });
    asUser(owner.id);

    const res = await DELETE(new NextRequest(`http://localhost/api/books/${book.id}`, { method: "DELETE" }), routeCtx({ id: String(book.id) }));

    expect(res.status).toBe(200);
    expect(await testPrisma.book.count()).toBe(0);
    expect(await testPrisma.review.count()).toBe(0);
    expect(await testPrisma.like.count()).toBe(0);
    expect(await testPrisma.report.count()).toBe(0);
  });
});

describe("getAwardBookEntries（作品が多い賞別一覧）", () => {
  it("上限を超える件数の作品でも、読書状況と感想の有無を付けて返せる", async () => {
    const [user] = await createUsers(1, "awardlist");
    const books = await createBooks(MANY);
    const award = await testPrisma.award.create({ data: { name: "[E2E_TEST] 架空の賞" } });
    await testPrisma.awardEntry.createMany({ data: books.map((b) => ({ bookId: b.id, awardId: award.id, year: 2020, type: "winner" })) });
    await testPrisma.readingStatus.createMany({ data: books.slice(0, 120).map((b) => ({ userId: user.id, bookId: b.id, status: "read" })) });
    await testPrisma.review.create({ data: { userId: user.id, bookId: books[0].id, body: "[E2E_TEST] 感想です。十分な長さの文章です。" } });

    const entries = await getAwardBookEntries({ awardId: award.id, userId: user.id });
    const all = await getAwardBookEntries({ awardId: "all", year: 2020, userId: user.id });

    expect(entries).toHaveLength(MANY);
    expect(entries.filter((e) => e.status === "read")).toHaveLength(120);
    expect(entries.filter((e) => e.status === "unread")).toHaveLength(MANY - 120);
    expect(entries.filter((e) => e.hasReview)).toHaveLength(1);
    expect(all).toHaveLength(MANY);
    expect(all[0].awardName).toBe("[E2E_TEST] 架空の賞");
  });
});
