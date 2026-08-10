/**
 * 実DB統合テスト。`api/favorite-authors` の複合ユニーク制約（重複登録）を検証する。
 *
 * `@@unique([userId, authorId])` はモックでは検証できない（P2002 を投げるかは
 * モック側の取り決めにすぎない）。実DBに対して同じ組み合わせを2回登録し、
 * 実際に制約が働くことを確認する。
 */
jest.mock("@/lib/session");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { jsonRequest } from "../helpers";

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/favorite-authors/route"));
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("POST /api/favorite-authors", () => {
  it("同じ著者を重複登録すると1件目のみが残る", async () => {
    const user = await testPrisma.user.create({
      data: { name: "テストユーザー", email: "fav-user@example.com", role: "user" },
    });
    const author = await testPrisma.author.create({ data: { name: "夏目漱石" } });

    asUser(user.id);
    const first = await POST(
      jsonRequest("/api/favorite-authors", { body: { authorId: author.id } })
    );
    expect(first.status).toBe(201);

    const second = await POST(
      jsonRequest("/api/favorite-authors", { body: { authorId: author.id } })
    );
    // ルート側は現状 P2002 を個別ハンドリングしておらず 500 を返す（既知の挙動）。
    // ここで検証したいのは「DB制約により2件目が作られないこと」であり、
    // レスポンスのステータスコードそのものはこのテストの主眼ではない。
    expect(second.status).toBeGreaterThanOrEqual(400);

    const rows = await testPrisma.favoriteAuthor.findMany({
      where: { userId: user.id, authorId: author.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("異なる著者はどちらも登録できる", async () => {
    const user = await testPrisma.user.create({
      data: { name: "テストユーザー2", email: "fav-user2@example.com", role: "user" },
    });
    const author1 = await testPrisma.author.create({ data: { name: "村上春樹" } });
    const author2 = await testPrisma.author.create({ data: { name: "川端康成" } });

    asUser(user.id);
    const res1 = await POST(
      jsonRequest("/api/favorite-authors", { body: { authorId: author1.id } })
    );
    const res2 = await POST(
      jsonRequest("/api/favorite-authors", { body: { authorId: author2.id } })
    );
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const rows = await testPrisma.favoriteAuthor.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
  });
});
