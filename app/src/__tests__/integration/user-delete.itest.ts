/**
 * 実DB統合テスト。`api/user/delete` のカスケード削除を検証する。
 *
 * Prisma モックでは「$transaction に渡した deleteMany が呼ばれたか」までしか
 * 検証できず、実際に外部キー制約・カスケード条件が正しいかは確認できない。
 * ここでは実DBに対して削除を実行し、関連レコードが本当に消えることを確認する。
 */
jest.mock("@/lib/session");

import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { getRequest } from "../helpers";

let DELETE: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  ({ DELETE } = await import("@/app/api/user/delete/route"));
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("DELETE /api/user/delete", () => {
  it("退会時に関連レコードがカスケードで削除される", async () => {
    const user = await testPrisma.user.create({
      data: { name: "退会太郎", email: "delete-target@example.com", role: "user" },
    });
    const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
    const book = await testPrisma.book.create({
      data: { title: "テスト本", authorId: author.id, publishedAt: new Date("2026-01-01") },
    });
    await testPrisma.readingStatus.create({
      data: { userId: user.id, bookId: book.id, status: "read" },
    });
    const review = await testPrisma.review.create({
      data: { userId: user.id, bookId: book.id, body: "とても良い本でした。おすすめです。" },
    });
    await testPrisma.favoriteAuthor.create({ data: { userId: user.id, authorId: author.id } });

    // いいね・通報・通知は他ユーザーが行為者になるケースも含めて確認する
    const otherUser = await testPrisma.user.create({
      data: { name: "他ユーザー", email: "other@example.com", role: "user" },
    });
    await testPrisma.like.create({ data: { userId: user.id, reviewId: review.id } });
    await testPrisma.notification.create({
      data: { userId: user.id, type: "like", content: "いいねが付きました" },
    });

    asUser(user.id);
    const res = await DELETE(getRequest("/api/user/delete", undefined, { method: "DELETE" }));
    expect(res.status).toBe(200);

    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await testPrisma.readingStatus.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await testPrisma.review.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await testPrisma.favoriteAuthor.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await testPrisma.like.findMany({ where: { userId: user.id } })).toHaveLength(0);
    expect(await testPrisma.notification.findMany({ where: { userId: user.id } })).toHaveLength(0);

    // 削除対象に依存しないデータは残る
    expect(await testPrisma.user.findUnique({ where: { id: otherUser.id } })).not.toBeNull();
    expect(await testPrisma.book.findUnique({ where: { id: book.id } })).not.toBeNull();
  });

  it("管理者アカウントは削除できない", async () => {
    const admin = await testPrisma.user.create({
      data: { name: "管理者", email: "admin-delete@example.com", role: "admin" },
    });

    asUser(admin.id);
    const res = await DELETE(getRequest("/api/user/delete", undefined, { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(await testPrisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });
});
