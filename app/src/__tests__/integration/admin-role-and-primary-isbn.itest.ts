/**
 * 実DB統合テスト。条件付き単一文に置き換えた次の処理を検証する。
 *   - 管理者の降格（最後の管理者を消さない）／昇格（上限を超えない）… userRoleRepository
 *   - 代表ISBNの付け替え … setPrimaryIsbn
 *
 * 特に「同時に複数のリクエストが来ても、管理者が 0 人にならない／上限を超えない」ことを
 * 並行実行で確認する（FOR UPDATE を使わずに MySQL でも成立することの検証）。
 * docs/cloudflare-d1-migration-plan.md §5-3
 */
jest.mock("@/lib/session");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asAdmin } from "../helpers/sessionMock";
import { jsonRequest, routeCtx } from "../helpers";
import { prisma } from "@/lib/prisma";
import { MAX_ADMIN_COUNT } from "@/lib/adminLimits";
import {
  demoteAdminUnlessLast,
  promoteToAdminUnderLimit,
} from "@/repositories/userRoleRepository";
import { setPrimaryIsbn } from "@/lib/bookIsbn";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

let seq = 0;
async function createUsers(role: "admin" | "user", count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    seq += 1;
    users.push(
      await testPrisma.user.create({
        data: { name: `${role}${seq}`, email: `${role}${seq}@example.com`, role },
      })
    );
  }
  return users;
}

const adminCount = () => testPrisma.user.count({ where: { role: "admin" } });

describe("demoteAdminUnlessLast", () => {
  it("管理者が複数いれば降格できる", async () => {
    const admins = await createUsers("admin", 2);
    expect(await demoteAdminUnlessLast(admins[0].id)).toBe(true);
    expect(await adminCount()).toBe(1);
  });

  it("最後の 1 人は降格できない", async () => {
    const [only] = await createUsers("admin", 1);
    expect(await demoteAdminUnlessLast(only.id)).toBe(false);
    expect(await adminCount()).toBe(1);
  });

  it("管理者でないユーザーには何もしない", async () => {
    await createUsers("admin", 2);
    const [user] = await createUsers("user", 1);
    expect(await demoteAdminUnlessLast(user.id)).toBe(false);
  });

  it("管理者 2 人を同時に降格しても、必ず 1 人以上が残る（繰り返し）", async () => {
    for (let round = 0; round < 15; round++) {
      await resetDb();
      const admins = await createUsers("admin", 2);
      // デッドロックで中断された側は再試行され、最新の管理者数で判定される
      const results = await Promise.all(admins.map((a) => demoteAdminUnlessLast(a.id)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await adminCount()).toBe(1);
    }
  }, 60_000);
});

describe("promoteToAdminUnderLimit", () => {
  it("上限未満なら昇格できる", async () => {
    await createUsers("admin", MAX_ADMIN_COUNT - 1);
    const [user] = await createUsers("user", 1);
    expect(await promoteToAdminUnderLimit(user.id, MAX_ADMIN_COUNT)).toBe(true);
    expect(await adminCount()).toBe(MAX_ADMIN_COUNT);
  });

  it("上限に達していると昇格できない", async () => {
    await createUsers("admin", MAX_ADMIN_COUNT);
    const [user] = await createUsers("user", 1);
    expect(await promoteToAdminUnderLimit(user.id, MAX_ADMIN_COUNT)).toBe(false);
    expect(await adminCount()).toBe(MAX_ADMIN_COUNT);
  });

  it("上限の 1 つ手前で 2 人を同時に昇格しても、上限を超えない（繰り返し）", async () => {
    for (let round = 0; round < 15; round++) {
      await resetDb();
      await createUsers("admin", MAX_ADMIN_COUNT - 1);
      const users = await createUsers("user", 2);
      const results = await Promise.all(
        users.map((u) => promoteToAdminUnderLimit(u.id, MAX_ADMIN_COUNT))
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await adminCount()).toBe(MAX_ADMIN_COUNT);
    }
  }, 60_000);
});

describe("PATCH /api/admin/users/[id]", () => {
  it("最後の管理者の降格は 400、管理者が複数なら 200", async () => {
    const { PATCH } = await import("@/app/api/admin/users/[id]/route");
    const [admin, other] = await createUsers("admin", 2);
    asAdmin(admin.id);

    const ok = await PATCH(
      jsonRequest(`/api/admin/users/${other.id}`, { method: "PATCH", body: { role: "user" } }),
      routeCtx({ id: String(other.id) })
    );
    expect(ok.status).toBe(200);
    expect(await adminCount()).toBe(1);

    // 残った管理者（admin）を、別の管理者として降格しようとする場合を模擬する
    const [actor] = await createUsers("user", 1);
    asAdmin(actor.id);
    const last = await PATCH(
      jsonRequest(`/api/admin/users/${admin.id}`, { method: "PATCH", body: { role: "user" } }),
      routeCtx({ id: String(admin.id) })
    );
    expect(last.status).toBe(400);
    expect(await adminCount()).toBe(1);
  });

  it("管理者数が上限なら昇格は 400", async () => {
    const { PATCH } = await import("@/app/api/admin/users/[id]/route");
    const admins = await createUsers("admin", MAX_ADMIN_COUNT);
    const [user] = await createUsers("user", 1);
    asAdmin(admins[0].id);

    const res = await PATCH(
      jsonRequest(`/api/admin/users/${user.id}`, { method: "PATCH", body: { role: "admin" } }),
      routeCtx({ id: String(user.id) })
    );
    expect(res.status).toBe(400);
    expect(await adminCount()).toBe(MAX_ADMIN_COUNT);
  });
});

describe("setPrimaryIsbn", () => {
  async function createBookWithIsbns(isbns: { isbn: string; isPrimary: boolean }[]) {
    const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
    const book = await testPrisma.book.create({
      data: { title: "テスト本", authorId: author.id, publishedAt: new Date("2026-01-01") },
    });
    for (const i of isbns) {
      await testPrisma.bookIsbn.create({ data: { bookId: book.id, ...i } });
    }
    return book;
  }

  it("代表ISBNを付け替えると、代表は常に 1 件だけになる", async () => {
    const book = await createBookWithIsbns([
      { isbn: "9780000000001", isPrimary: true },
      { isbn: "9780000000002", isPrimary: false },
      { isbn: "9780000000003", isPrimary: false },
    ]);

    await setPrimaryIsbn(book.id, "9780000000003");

    const rows = await testPrisma.bookIsbn.findMany({ where: { bookId: book.id } });
    expect(rows.filter((r) => r.isPrimary).map((r) => r.isbn)).toEqual(["9780000000003"]);
  });

  it("すでに代表のISBNを指定しても代表は 1 件のまま", async () => {
    const book = await createBookWithIsbns([
      { isbn: "9780000000001", isPrimary: true },
      { isbn: "9780000000002", isPrimary: false },
    ]);

    await setPrimaryIsbn(book.id, "9780000000001");

    const rows = await testPrisma.bookIsbn.findMany({ where: { bookId: book.id } });
    expect(rows.filter((r) => r.isPrimary).map((r) => r.isbn)).toEqual(["9780000000001"]);
  });

  it("他の本のISBNを指定すると例外になり、何も変更されない", async () => {
    const book = await createBookWithIsbns([{ isbn: "9780000000001", isPrimary: true }]);
    const other = await createBookWithIsbns([{ isbn: "9780000000009", isPrimary: true }]);

    await expect(setPrimaryIsbn(book.id, "9780000000009")).rejects.toThrow();

    const rows = await testPrisma.bookIsbn.findMany({ where: { bookId: other.id } });
    expect(rows.map((r) => r.isPrimary)).toEqual([true]);
  });

  it("未登録のISBNを指定すると例外になる", async () => {
    const book = await createBookWithIsbns([{ isbn: "9780000000001", isPrimary: true }]);
    await expect(setPrimaryIsbn(book.id, "9780000000555")).rejects.toThrow();
  });

  it("検証後に対象ISBNが削除されても例外になり、他の行の代表フラグを変更しない", async () => {
    const book = await createBookWithIsbns([
      { isbn: "9780000000001", isPrimary: true },
      { isbn: "9780000000002", isPrimary: false },
      { isbn: "9780000000003", isPrimary: false },
    ]);
    const findUnique = prisma.bookIsbn.findUnique.bind(prisma.bookIsbn);
    const spy = jest.spyOn(prisma.bookIsbn, "findUnique").mockImplementationOnce((args) => {
      // 本処理は await のみ使用するため、Prisma の関連取得メソッドは不要。
      return (async () => {
        const target = await findUnique(args);
        await testPrisma.bookIsbn.delete({ where: { isbn: "9780000000002" } });
        return target;
      })() as ReturnType<typeof findUnique>;
    });
    try {
      await expect(setPrimaryIsbn(book.id, "9780000000002")).rejects.toThrow("登録されていません");
      const rows = await testPrisma.bookIsbn.findMany({
        where: { bookId: book.id }, orderBy: { isbn: "asc" },
        select: { isbn: true, isPrimary: true },
      });
      expect(rows).toEqual([
        { isbn: "9780000000001", isPrimary: true },
        { isbn: "9780000000003", isPrimary: false },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("実DBの変更なしUPDATEの戻り値に依存せず代表ISBNを再指定できる", async () => {
    const book = await createBookWithIsbns([
      { isbn: "9780000000001", isPrimary: true },
      { isbn: "9780000000002", isPrimary: false },
    ]);
    const affected = await prisma.$executeRaw`
      UPDATE book_isbns SET is_primary = (isbn = ${"9780000000001"})
      WHERE book_id = ${book.id}
    `;
    console.info("MySQL unchanged primary ISBN UPDATE affected rows:", affected);
    expect([0, 2]).toContain(affected);
    await expect(setPrimaryIsbn(book.id, "9780000000001")).resolves.toBeUndefined();
    expect(await testPrisma.bookIsbn.count({ where: { bookId: book.id, isPrimary: true } })).toBe(1);
  });
});
