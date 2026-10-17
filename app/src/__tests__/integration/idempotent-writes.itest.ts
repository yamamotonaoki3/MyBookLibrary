/**
 * 実DB統合テスト。トランザクションを使わない形（原子的な一括実行・冪等化）に置き換えた
 * 3 つの処理を検証する。docs/archive/cloudflare-d1-migration-plan.md §5-3
 *   - ユーザー削除（本人退会・管理者による削除）… deleteNonAdminUser
 *   - 手動登録本の統合 … POST /api/admin/manual-books/merge
 *   - 受賞登録の更新 … PATCH /api/admin/award-entries/[id]
 */
jest.mock("@/lib/session");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asAdmin } from "../helpers/sessionMock";
import { jsonRequest, routeCtx } from "../helpers";
import { prisma } from "@/lib/prisma";
import { deleteNonAdminUser } from "@/repositories/userDeletionRepository";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

async function createUser(name: string, email: string, role = "user") {
  return testPrisma.user.create({ data: { name, email, role } });
}

async function createBook(title: string, extra: Record<string, unknown> = {}) {
  const author = await testPrisma.author.create({ data: { name: `${title}の著者` } });
  return testPrisma.book.create({
    data: { title, authorId: author.id, publishedAt: new Date("2026-01-01"), ...extra },
  });
}

describe("deleteNonAdminUser", () => {
  async function seedRelatedData(userId: number) {
    const other = await createUser("他ユーザー", `other-${userId}@example.com`);
    const book = await createBook(`本${userId}`);
    const review = await testPrisma.review.create({
      data: { userId, bookId: book.id, body: "削除対象の感想です。十分な長さ。" },
    });
    await testPrisma.readingStatus.create({ data: { userId, bookId: book.id, status: "read" } });
    await testPrisma.favoriteAuthor.create({ data: { userId, authorId: book.authorId } });
    await testPrisma.like.create({ data: { userId, reviewId: review.id } });
    await testPrisma.report.create({ data: { userId, reviewId: review.id } });
    await testPrisma.notification.create({ data: { userId, type: "like", content: "通知" } });
    await testPrisma.notification.create({
      data: { userId: other.id, type: "mutual_favorite_author", content: "相互", actorId: userId },
    });
    return { other, book, review };
  }

  it("一般ユーザーと関連データを削除し、他ユーザー宛の無関係な通知は残す", async () => {
    const user = await createUser("退会者", "leave@example.com");
    const { other } = await seedRelatedData(user.id);
    await testPrisma.notification.create({
      data: { userId: other.id, type: "like", content: "他ユーザーへの通常通知", actorId: user.id },
    });

    expect(await deleteNonAdminUser(user.id)).toBe(true);

    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await testPrisma.review.count({ where: { userId: user.id } })).toBe(0);
    expect(await testPrisma.readingStatus.count({ where: { userId: user.id } })).toBe(0);
    expect(await testPrisma.favoriteAuthor.count({ where: { userId: user.id } })).toBe(0);
    expect(await testPrisma.like.count({ where: { userId: user.id } })).toBe(0);
    expect(await testPrisma.report.count({ where: { userId: user.id } })).toBe(0);
    const remaining = await testPrisma.notification.findMany({ where: { userId: other.id } });
    expect(remaining.map((n) => n.content)).toEqual(["他ユーザーへの通常通知"]);
  });

  it("対象が管理者なら何も削除しない（昇格された競合の再現）", async () => {
    const admin = await createUser("昇格済み", "promoted@example.com", "admin");
    await seedRelatedData(admin.id);

    expect(await deleteNonAdminUser(admin.id)).toBe(false);

    expect(await testPrisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
    expect(await testPrisma.review.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.readingStatus.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.favoriteAuthor.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.like.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.report.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.notification.count({ where: { userId: admin.id } })).toBe(1);
    expect(await testPrisma.notification.count({ where: { actorId: admin.id } })).toBe(1);
  });

  it("存在しないユーザーは false", async () => {
    expect(await deleteNonAdminUser(999999)).toBe(false);
  });
});

describe("POST /api/admin/manual-books/merge", () => {
  it("重複する読書状況・受賞登録は破棄し、残りを付け替え、統合元を削除する", async () => {
    const { POST } = await import("@/app/api/admin/manual-books/merge/route");
    const admin = await createUser("管理者", "admin@example.com", "admin");
    const alice = await createUser("アリス", "alice@example.com");
    const bob = await createUser("ボブ", "bob@example.com");
    const source = await createBook("手動登録の本", { source: "manual" });
    const target = await createBook("統合先の本");
    const award = await testPrisma.award.create({ data: { name: "テスト賞" } });
    const award2 = await testPrisma.award.create({ data: { name: "別のテスト賞" } });

    // alice は両方に読書状況あり（統合元は破棄）、bob は統合元のみ（付け替え）
    await testPrisma.readingStatus.createMany({
      data: [
        { userId: alice.id, bookId: source.id, status: "want_to_read" },
        { userId: alice.id, bookId: target.id, status: "read" },
        { userId: bob.id, bookId: source.id, status: "reading" },
      ],
    });
    // 同じ賞・年度は破棄、別の賞は付け替え
    await testPrisma.awardEntry.createMany({
      data: [
        { bookId: source.id, awardId: award.id, year: 2020, type: "winner" },
        { bookId: target.id, awardId: award.id, year: 2020, type: "winner" },
        { bookId: source.id, awardId: award2.id, year: 2021, type: "nominee" },
      ],
    });
    await testPrisma.review.create({
      data: { userId: alice.id, bookId: source.id, body: "統合元への感想です。十分な長さ。" },
    });

    asAdmin(admin.id);
    const res = await POST(
      jsonRequest("/api/admin/manual-books/merge", {
        body: { sourceBookId: source.id, targetBookId: target.id },
      })
    );
    expect(res.status).toBe(200);

    expect(await testPrisma.book.findUnique({ where: { id: source.id } })).toBeNull();
    const statuses = await testPrisma.readingStatus.findMany({
      where: { bookId: target.id },
      orderBy: { userId: "asc" },
    });
    expect(statuses.map((s) => [s.userId, s.status])).toEqual([
      [alice.id, "read"],
      [bob.id, "reading"],
    ]);
    // 付け替えた行の更新日時も、Date として読める有効な値になっている
    expect(Math.abs(Date.now() - statuses[1].updatedAt.getTime())).toBeLessThan(60_000);
    const entries = await testPrisma.awardEntry.findMany({ where: { bookId: target.id } });
    expect(entries.map((e) => [e.awardId, e.year]).sort()).toEqual(
      [
        [award.id, 2020],
        [award2.id, 2021],
      ].sort()
    );
    expect(await testPrisma.review.count({ where: { bookId: target.id } })).toBe(1);
  });

  it("統合先に受賞登録がなくても統合できる", async () => {
    const { POST } = await import("@/app/api/admin/manual-books/merge/route");
    const admin = await createUser("管理者", "admin@example.com", "admin");
    const source = await createBook("手動登録の本", { source: "manual" });
    const target = await createBook("統合先の本");
    const award = await testPrisma.award.create({ data: { name: "テスト賞" } });
    await testPrisma.awardEntry.create({
      data: { bookId: source.id, awardId: award.id, year: 2022, type: "winner" },
    });

    asAdmin(admin.id);
    const res = await POST(
      jsonRequest("/api/admin/manual-books/merge", {
        body: { sourceBookId: source.id, targetBookId: target.id },
      })
    );
    expect(res.status).toBe(200);
    expect(await testPrisma.awardEntry.count({ where: { bookId: target.id } })).toBe(1);
  });
});

describe("PATCH /api/admin/award-entries/[id]", () => {
  async function setup() {
    const { PATCH } = await import("@/app/api/admin/award-entries/[id]/route");
    const admin = await createUser("管理者", "admin@example.com", "admin");
    const book = await createBook("更新前タイトル");
    const award = await testPrisma.award.create({ data: { name: "テスト賞" } });
    const entry = await testPrisma.awardEntry.create({
      data: { bookId: book.id, awardId: award.id, year: 2020, type: "nominee" },
    });
    asAdmin(admin.id);
    const patch = (body: unknown) =>
      PATCH(
        jsonRequest(`/api/admin/award-entries/${entry.id}`, { method: "PATCH", body }),
        routeCtx({ id: String(entry.id) })
      );
    return { patch, book, entry };
  }

  it("タイトル・著者（新規作成）・ISBN・受賞区分を更新できる", async () => {
    const { patch, book, entry } = await setup();

    const res = await patch({
      title: "更新後タイトル",
      author: "新しい著者",
      isbns: [{ isbn: "9780000000011", isPrimary: true }],
      type: "winner",
    });
    expect(res.status).toBe(200);

    const updatedBook = await testPrisma.book.findUniqueOrThrow({
      where: { id: book.id },
      include: { author: true },
    });
    expect(updatedBook.title).toBe("更新後タイトル");
    expect(updatedBook.author.name).toBe("新しい著者");
    expect(updatedBook.isbn).toBe("9780000000011");
    expect((await testPrisma.awardEntry.findUniqueOrThrow({ where: { id: entry.id } })).type).toBe("winner");
  });

  it("既存の著者名なら著者を新規作成せず再利用する", async () => {
    const { patch } = await setup();
    const existing = await testPrisma.author.create({ data: { name: "既存の著者" } });
    const before = await testPrisma.author.count();

    const res = await patch({ author: "既存の著者" });
    expect(res.status).toBe(200);
    expect(await testPrisma.author.count()).toBe(before);
    expect(existing.id).toBeGreaterThan(0);
  });

  it("ISBN が他の本と衝突する場合は 409 で、タイトルなど他の項目も更新されない", async () => {
    const { patch, book, entry } = await setup();
    const other = await createBook("別の本");
    await testPrisma.bookIsbn.create({
      data: { bookId: other.id, isbn: "9780000000099", isPrimary: true },
    });

    const res = await patch({
      title: "更新されてはいけない",
      isbns: [{ isbn: "9780000000099", isPrimary: true }],
      type: "winner",
    });
    expect(res.status).toBe(409);

    expect((await testPrisma.book.findUniqueOrThrow({ where: { id: book.id } })).title).toBe("更新前タイトル");
    expect((await testPrisma.awardEntry.findUniqueOrThrow({ where: { id: entry.id } })).type).toBe("nominee");
  });

  it("同じ更新を 2 回送っても同じ結果になる（冪等）", async () => {
    const { patch, book } = await setup();
    const body = {
      title: "二回目も同じ",
      isbns: [{ isbn: "9780000000021", isPrimary: true }],
    };
    expect((await patch(body)).status).toBe(200);
    expect((await patch(body)).status).toBe(200);

    const rows = await testPrisma.bookIsbn.findMany({ where: { bookId: book.id } });
    expect(rows.map((r) => [r.isbn, r.isPrimary])).toEqual([["9780000000021", true]]);
  });
});
