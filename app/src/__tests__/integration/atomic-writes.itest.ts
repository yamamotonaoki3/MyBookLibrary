/**
 * 実DB統合テスト。`atomically`（読み取りを挟まない複数書き込みの原子化）と、
 * それを使う 4 つのルート（フォロー解除・管理者パスワードリセット・管理者による感想削除・
 * 監査ログ一覧）を検証する。
 *
 * D1 への移行（docs/cloudflare-d1-migration-plan.md §5-3）に備え、
 * 「途中で失敗したら先の書き込みも残らない」性質をここで固定する。
 */
jest.mock("@/lib/session");

import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { getRequest, jsonRequest, routeCtx } from "../helpers";
import { atomically, d1Timestamp, type AtomicStep } from "@/lib/atomically";
import { prisma } from "@/lib/prisma";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

async function createUser(name: string, email: string, extra: Record<string, unknown> = {}) {
  return testPrisma.user.create({ data: { name, email, role: "user", ...extra } });
}

async function createBook(isbn: string | null) {
  const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
  return testPrisma.book.create({
    data: { title: "テスト本", authorId: author.id, isbn, publishedAt: new Date("2026-01-01") },
  });
}

describe("atomically", () => {
  /** ユーザーを 1 件作る書き込み（MySQL は Prisma、D1 は同じ意味の SQL）。 */
  const insertUser = (name: string, email: string): AtomicStep => ({
    prisma: () => prisma.user.create({ data: { name, email, role: "user" } }),
    d1: {
      sql: "INSERT INTO users (name, email, role, created_at) VALUES (?, ?, 'user', ?)",
      params: [name, email, d1Timestamp()],
    },
  });

  it("途中の書き込みが失敗すると、先の書き込みも反映されない", async () => {
    await createUser("既存", "dup@example.com");

    await expect(
      atomically([insertUser("新規", "new@example.com"), insertUser("重複", "dup@example.com")])
    ).rejects.toThrow();

    expect(await testPrisma.user.findUnique({ where: { email: "new@example.com" } })).toBeNull();
  });

  it("すべて成功すると、すべて反映され、影響行数が返る", async () => {
    const counts = await atomically([insertUser("A", "a@example.com"), insertUser("B", "b@example.com")]);

    expect(await testPrisma.user.count()).toBe(2);
    expect(counts).toEqual([1, 1]);
  });

  it("requireRow の書き込みの対象がなければ、全体が失敗して先の書き込みも取り消される", async () => {
    await expect(
      atomically([
        insertUser("新規", "new@example.com"),
        {
          prisma: () => prisma.user.delete({ where: { id: 999999 } }),
          d1: { sql: "DELETE FROM users WHERE id = ?", params: [999999] },
          requireRow: true,
        },
      ])
    ).rejects.toMatchObject({ code: "P2025" });

    expect(await testPrisma.user.findUnique({ where: { email: "new@example.com" } })).toBeNull();
  });

  it("requireRow の書き込みの対象があれば、通常どおり反映される", async () => {
    const target = await createUser("対象", "target@example.com");

    const [, deleted] = await atomically([
      insertUser("新規", "new@example.com"),
      {
        prisma: () => prisma.user.delete({ where: { id: target.id } }),
        d1: { sql: "DELETE FROM users WHERE id = ?", params: [target.id] },
        requireRow: true,
      },
    ]);

    expect(deleted).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { email: "target@example.com" } })).toBeNull();
    expect(await testPrisma.user.findUnique({ where: { email: "new@example.com" } })).not.toBeNull();
  });

  it("複数行に影響する更新・削除は、その行数を返す", async () => {
    await createUser("A", "a@example.com");
    await createUser("B", "b@example.com");
    await createUser("C", "c@example.com");

    const [updated, deleted] = await atomically([
      {
        prisma: () => prisma.user.updateMany({ where: { email: { in: ["a@example.com", "b@example.com"] } }, data: { name: "更新" } }),
        d1: { sql: "UPDATE users SET name = ? WHERE email IN (?, ?)", params: ["更新", "a@example.com", "b@example.com"] },
      },
      {
        prisma: () => prisma.user.deleteMany({ where: { email: "c@example.com" } }),
        d1: { sql: "DELETE FROM users WHERE email = ?", params: ["c@example.com"] },
      },
    ]);

    expect([updated, deleted]).toEqual([2, 1]);
  });
});

describe("DELETE /api/follows", () => {
  let DELETE: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/follows/route"));
  });

  it("相互フォローの解除で、フォローと相互通知が削除され、無関係な通知は残る", async () => {
    const me = await createUser("自分", "me@example.com");
    const other = await createUser("相手", "other@example.com");
    const third = await createUser("第三者", "third@example.com");
    await testPrisma.follow.createMany({
      data: [
        { followerId: me.id, followingId: other.id },
        { followerId: other.id, followingId: me.id },
      ],
    });
    await testPrisma.notification.createMany({
      data: [
        { userId: me.id, type: "mutual_favorite_author", content: "相互", actorId: other.id },
        { userId: other.id, type: "mutual_want_to_read", content: "相互", actorId: me.id },
        { userId: me.id, type: "mutual_favorite_author", content: "別の相手", actorId: third.id },
      ],
    });

    asUser(me.id);
    const res = await DELETE(
      jsonRequest("/api/follows", { method: "DELETE", body: { targetUserId: other.id } })
    );
    expect(res.status).toBe(200);

    expect(await testPrisma.follow.count({ where: { followerId: me.id, followingId: other.id } })).toBe(0);
    expect(await testPrisma.follow.count({ where: { followerId: other.id, followingId: me.id } })).toBe(1);
    const rest = await testPrisma.notification.findMany();
    expect(rest).toHaveLength(1);
    expect(rest[0].actorId).toBe(third.id);
  });

  it("片思い（相手からのフォローなし）の解除では、フォローだけが削除される", async () => {
    const me = await createUser("自分", "me@example.com");
    const other = await createUser("相手", "other@example.com");
    await testPrisma.follow.create({ data: { followerId: me.id, followingId: other.id } });
    await testPrisma.notification.create({
      data: { userId: me.id, type: "mutual_favorite_author", content: "残る", actorId: other.id },
    });

    asUser(me.id);
    const res = await DELETE(
      jsonRequest("/api/follows", { method: "DELETE", body: { targetUserId: other.id } })
    );
    expect(res.status).toBe(200);
    expect(await testPrisma.follow.count()).toBe(0);
    expect(await testPrisma.notification.count()).toBe(1);
  });
});

describe("POST /api/admin/users/[id]/reset-password", () => {
  it("パスワード更新・要変更フラグ・ロック解除・通知作成が一度に反映される", async () => {
    const admin = await createUser("管理者", "admin@example.com", { role: "admin" });
    const target = await createUser("対象", "target@example.com", {
      password: "$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhashdummyhash",
      loginFailCount: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    });
    const { POST } = await import("@/app/api/admin/users/[id]/reset-password/route");

    asUser(admin.id);
    const res = await POST(
      getRequest(`/api/admin/users/${target.id}/reset-password`, undefined, { method: "POST" }),
      routeCtx({ id: String(target.id) })
    );
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).tempPassword).toBe("string");

    const updated = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.loginFailCount).toBe(0);
    expect(updated.lockedUntil).toBeNull();
    expect(updated.password).not.toContain("dummyhash");
    const notes = await testPrisma.notification.findMany({ where: { userId: target.id } });
    expect(notes.map((n) => n.type)).toEqual(["password_reset_by_admin"]);
    // SQL で直接保存した日時も、Prisma で Date として読める（D1 では ISO 8601 の文字列で保存する）
    expect(Math.abs(Date.now() - notes[0].createdAt.getTime())).toBeLessThan(60_000);
    expect(notes[0].isRead).toBe(false);
  });
});

describe("DELETE /api/admin/reviews/[id]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/admin/reviews/[id]/route"));
  });

  it("ISBN ありの本: 感想が削除され通知が作られ、再度削除しても通知は 1 件に保たれる", async () => {
    const admin = await createUser("管理者", "admin@example.com", { role: "admin" });
    const owner = await createUser("投稿者", "owner@example.com");
    const book = await createBook("9780000000001");
    const first = await testPrisma.review.create({
      data: { userId: owner.id, bookId: book.id, body: "最初の感想です。十分な長さ。" },
    });

    asUser(admin.id);
    const res1 = await DELETE(
      getRequest(`/api/admin/reviews/${first.id}`, undefined, { method: "DELETE" }),
      routeCtx({ id: String(first.id) })
    );
    expect(res1.status).toBe(204);
    expect(await testPrisma.review.count()).toBe(0);
    const notice = await testPrisma.notification.findFirstOrThrow({ where: { userId: owner.id, type: "review_deleted" } });
    expect(notice.bookIsbn).toBe("9780000000001");
    expect(notice.bookTitle).toBe("テスト本");
    expect(Math.abs(Date.now() - notice.createdAt.getTime())).toBeLessThan(60_000);

    const second = await testPrisma.review.create({
      data: { userId: owner.id, bookId: book.id, body: "二つ目の感想です。十分な長さ。" },
    });
    const res2 = await DELETE(
      getRequest(`/api/admin/reviews/${second.id}`, undefined, { method: "DELETE" }),
      routeCtx({ id: String(second.id) })
    );
    expect(res2.status).toBe(204);
    expect(await testPrisma.notification.count({ where: { userId: owner.id, type: "review_deleted" } })).toBe(1);
  });

  it("ISBN なしの本: 感想が削除され通知が作られる", async () => {
    const admin = await createUser("管理者", "admin@example.com", { role: "admin" });
    const owner = await createUser("投稿者", "owner@example.com");
    const book = await createBook(null);
    const r = await testPrisma.review.create({
      data: { userId: owner.id, bookId: book.id, body: "ISBNなしの本の感想です。十分な長さ。" },
    });

    asUser(admin.id);
    const res = await DELETE(
      getRequest(`/api/admin/reviews/${r.id}`, undefined, { method: "DELETE" }),
      routeCtx({ id: String(r.id) })
    );
    expect(res.status).toBe(204);
    expect(await testPrisma.review.count()).toBe(0);
    expect(await testPrisma.notification.count({ where: { type: "review_deleted" } })).toBe(1);
  });
});

describe("GET /api/admin/audit-logs", () => {
  it("一覧と総件数が同じ条件で返る", async () => {
    const admin = await createUser("管理者", "admin@example.com", { role: "admin" });
    await testPrisma.auditLog.createMany({
      data: [
        { eventType: "LOGIN_FAILURE", actorUserId: admin.id },
        { eventType: "LOGIN_FAILURE", actorUserId: admin.id },
        { eventType: "ACCOUNT_LOCKED", actorUserId: admin.id },
      ],
    });
    const { GET } = await import("@/app/api/admin/audit-logs/route");

    asUser(admin.id);
    const res = await GET(
      getRequest("/api/admin/audit-logs", { eventType: "LOGIN_FAILURE", pageSize: 1 })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(2);
    expect(json.items).toHaveLength(1);
  });
});
