/**
 * 実DB統合テスト。`api/reading-status` の upsert を検証する。
 *
 * `@@unique([userId, bookId])` を使った `upsert` が、実DBに対して
 * 「新規作成」と「既存更新」の両方を正しく1レコードに保つことを確認する。
 * また status="unread" のときは論理削除ではなく物理削除される仕様も確認する。
 */
jest.mock("@/lib/session");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { jsonRequest } from "../helpers";

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/reading-status/route"));
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("POST /api/reading-status", () => {
  const body = {
    title: "吾輩は猫である",
    author: "夏目漱石",
    status: "reading",
  };

  it("同じ本への2回目の登録は新規行を作らず既存行を更新する", async () => {
    const user = await testPrisma.user.create({
      data: { name: "読書ユーザー", email: "reading-user@example.com", role: "user" },
    });

    asUser(user.id);
    const first = await POST(jsonRequest("/api/reading-status", { body }));
    expect(first.status).toBe(200);

    const second = await POST(
      jsonRequest("/api/reading-status", { body: { ...body, status: "read" } })
    );
    expect(second.status).toBe(200);

    const rows = await testPrisma.readingStatus.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("read");
  });

  it("status=unread にすると行が物理削除される", async () => {
    const user = await testPrisma.user.create({
      data: { name: "読書ユーザー2", email: "reading-user2@example.com", role: "user" },
    });

    asUser(user.id);
    await POST(jsonRequest("/api/reading-status", { body }));
    expect(await testPrisma.readingStatus.findMany({ where: { userId: user.id } })).toHaveLength(1);

    const res = await POST(
      jsonRequest("/api/reading-status", { body: { ...body, status: "unread" } })
    );
    expect(res.status).toBe(200);
    expect(await testPrisma.readingStatus.findMany({ where: { userId: user.id } })).toHaveLength(0);
  });
});
