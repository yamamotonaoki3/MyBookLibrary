/**
 * 実DB統合テスト。`createMany({ skipDuplicates })` を使わない形に書き換えた 2 箇所を検証する（B4b）。
 *   - いいねの通知: 同じ宛先・本の通知が既にあれば作らない … notificationRepository
 *   - CSV インポート: 新しい著者の一括作成
 * SQLite（D1）は skipDuplicates に対応していないため、MySQL と D1 の両方で同じ結果になることを確認する。
 */
jest.mock("@/lib/session");

import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { asAdmin, asUser } from "../helpers/sessionMock";
import { getRequest, routeCtx } from "../helpers";
import { prisma } from "@/lib/prisma";
import { createNotificationIfAbsent } from "@/repositories/notificationRepository";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

let seq = 0;
async function createUser(name: string, role = "user") {
  seq += 1;
  return testPrisma.user.create({ data: { name, email: `skipdup${seq}@example.com`, role } });
}

async function createReview(ownerId: number, isbn: string | null) {
  const author = await testPrisma.author.create({ data: { name: `著者${seq}` } });
  const book = await testPrisma.book.create({
    data: { title: `本${seq}`, authorId: author.id, isbn, publishedAt: new Date("2026-01-01") },
  });
  const review = await testPrisma.review.create({
    data: { userId: ownerId, bookId: book.id, body: "いいねを受ける感想です。十分な長さ。" },
  });
  return { book, review };
}

describe("createNotificationIfAbsent", () => {
  it("同じ宛先・種類・本の通知が既にあれば、作らずに false を返し、既存の通知は変更しない", async () => {
    const owner = await createUser("宛先");
    const base = { userId: owner.id, type: "like", bookIsbn: "9780000000001", bookTitle: "本" };

    expect(await createNotificationIfAbsent({ ...base, content: "最初" })).toBe(true);
    expect(await createNotificationIfAbsent({ ...base, content: "2 回目" })).toBe(false);

    const rows = await testPrisma.notification.findMany();
    expect(rows.map((r) => r.content)).toEqual(["最初"]);
  });

  it("ISBN が null の通知は、別の行として毎回作られる", async () => {
    const owner = await createUser("宛先");
    const base = { userId: owner.id, type: "like", bookIsbn: null, bookTitle: "ISBNなし" };

    expect(await createNotificationIfAbsent({ ...base, content: "1" })).toBe(true);
    expect(await createNotificationIfAbsent({ ...base, content: "2" })).toBe(true);

    expect(await testPrisma.notification.count()).toBe(2);
  });

  it("一意制約違反以外のエラーは握りつぶさない", async () => {
    await expect(
      createNotificationIfAbsent({ userId: 999999, type: "like", content: "宛先なし", bookIsbn: null, bookTitle: "x" })
    ).rejects.toThrow();
  });
});

describe("POST /api/reviews/[id]/likes", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/reviews/[id]/likes/route"));
  });

  const like = (userId: number, reviewId: number) => {
    asUser(userId);
    return POST(getRequest(`/api/reviews/${reviewId}/likes`, undefined, { method: "POST" }), routeCtx({ id: String(reviewId) }));
  };

  it("別の 2 人が同じ感想にいいねしても、投稿者への通知は 1 件のまま", async () => {
    const owner = await createUser("投稿者");
    const a = await createUser("いいねA");
    const b = await createUser("いいねB");
    const { review } = await createReview(owner.id, "9780000000002");

    expect((await like(a.id, review.id)).status).toBe(201);
    const second = await like(b.id, review.id);
    expect(second.status).toBe(201);
    expect((await second.json()).count).toBe(2);

    expect(await testPrisma.like.count({ where: { reviewId: review.id } })).toBe(2);
    expect(await testPrisma.notification.count({ where: { userId: owner.id, type: "like" } })).toBe(1);
  });

  it("ISBN のない本では、いいねのたびに通知が作られる", async () => {
    const owner = await createUser("投稿者");
    const a = await createUser("いいねA");
    const b = await createUser("いいねB");
    const { review } = await createReview(owner.id, null);

    await like(a.id, review.id);
    await like(b.id, review.id);

    expect(await testPrisma.notification.count({ where: { userId: owner.id, type: "like" } })).toBe(2);
  });

  it("自分の感想へのいいねでは通知を作らない", async () => {
    const owner = await createUser("投稿者");
    const { review } = await createReview(owner.id, "9780000000003");

    expect((await like(owner.id, review.id)).status).toBe(201);

    expect(await testPrisma.notification.count()).toBe(0);
  });
});

describe("POST /api/admin/import-csv（著者の一括作成）", () => {
  it("CSV に含まれる新しい著者をまとめて作り、本と受賞登録を作る", async () => {
    const { POST } = await import("@/app/api/admin/import-csv/route");
    const admin = await createUser("管理者", "admin");
    const award = await testPrisma.award.create({ data: { name: "テスト賞" } });
    asAdmin(admin.id);

    const csv = [
      "title,author,isbn,coverImageUrl,publishedAt,awardId,year,type",
      `本A,著者あ,9780000000011,,2020-01-01,${award.id},2020,winner`,
      `本B,著者い,9780000000012,,2021-02-01,${award.id},2021,nominee`,
      `本C,著者あ,9780000000013,,2022-03-01,${award.id},2022,winner`,
    ].join("\n");
    const formData = new FormData();
    formData.set("file", new File([csv], "import.csv", { type: "text/csv" }));

    const res = await POST(new NextRequest("http://localhost/api/admin/import-csv", { method: "POST", body: formData }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(3);

    const authors = await testPrisma.author.findMany({ orderBy: { name: "asc" } });
    expect(authors.map((a) => a.name).sort()).toEqual(["著者あ", "著者い"]);
    expect(await testPrisma.book.count()).toBe(3);
    expect(await testPrisma.awardEntry.count()).toBe(3);
  });
});
