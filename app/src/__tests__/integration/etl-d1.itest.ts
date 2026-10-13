/**
 * 結合テスト（D1）。MySQL → D1 のデータ移行（ETL）と照合を、ローカルの D1（miniflare）に対して検証する（#689）。
 * 移行元は、架空データ（`@example.com`、`[E2E_TEST]`）を一度ローカルの D1 に作って読み出した内容（スナップショット）。
 * 移行先は、同じ D1 を空にしたもの。実データ・本番の D1 には接続しない。
 * MySQL → D1 の部分は、MySQL を読む Prisma クライアントが同じモデル操作を提供するため、ここでは D1 から読んだ値で代える。
 */
import { testPrisma, resetDb, isD1 } from "../helpers/dbTest";
import { FakeDb } from "../helpers/etlFakeDb";
import { seedFictionalData } from "../helpers/etlFixtures";
import { MIGRATION_TABLES } from "@/lib/migration/etl/tables";
import { assertTargetEmpty, migrate, resetTarget, verifyAll, type MigrationClient } from "@/lib/migration/etl/run";
import { prisma } from "@/lib/prisma";

// D1 版でだけ実行する（移行先が D1 のため）
const describeD1 = isD1 ? describe : describe.skip;

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbNull = isD1 ? (require("../../generated/prisma-d1").Prisma.DbNull as unknown) : undefined;

const target = testPrisma as unknown as MigrationClient;

/** 全テーブルを読み出して、移行元の代わりにするメモリ上の DB を作る。 */
async function snapshot(): Promise<FakeDb> {
  const db = new FakeDb();
  for (const spec of MIGRATION_TABLES) {
    const delegate = (testPrisma as unknown as Record<string, { findMany: (args: object) => Promise<Record<string, unknown>[]> }>)[spec.model];
    db.tables.set(spec.model, await delegate.findMany({ orderBy: spec.orderBy.map((key) => ({ [key]: "asc" })) }));
  }
  return db;
}

describeD1("MySQL → D1 のデータ移行（ローカルの D1・架空データ）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedFictionalData(testPrisma);
  });

  it("全 21 テーブルを移行でき、照合がすべて PASS になる（メールは小文字化される）", async () => {
    const source = await snapshot();
    expect(source.tables.get("user")![0].email).toBe("Admin_User@Example.com");
    await resetTarget(target);

    const summaries = await migrate(source.client(), target, { pageSize: 2, dbNull });

    expect(summaries).toHaveLength(21);
    expect(summaries.every((s) => s.source === s.written)).toBe(true);
    const checks = await verifyAll(source.client(), target, 2);
    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(checks.length).toBeGreaterThan(100);
    expect((await testPrisma.user.findUnique({ where: { id: 1 } }))?.email).toBe("admin_user@example.com");
    // 変換対象外の列は、そのまま
    const user = await testPrisma.user.findUnique({ where: { id: 1 } });
    expect(user).toMatchObject({ name: "テスト太郎", password: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234", createdAt: new Date("2026-01-01T00:00:00.123Z") });
    expect((await testPrisma.review.findUnique({ where: { id: 1 } }))?.body).toBe("[E2E_TEST] 感想です。🌸 十分な長さの文章です。\n改行も含みます。");
    // Json 列: NULL は NULL のまま、値はそのまま
    expect((await testPrisma.auditLog.findUnique({ where: { id: 1 } }))?.detail).toBeNull();
    expect((await testPrisma.auditLog.findUnique({ where: { id: 2 } }))?.detail).toEqual({ fields: ["name", "日本語"], count: 2 });
  });

  it("移行後に新規登録しても、移行した行の ID と衝突しない（採番が最大 ID に追いついている）", async () => {
    const source = await snapshot();
    await resetTarget(target);
    await migrate(source.client(), target, { dbNull });

    const created = await testPrisma.user.create({ data: { name: "testuser_new", email: "testuser_new@example.com" } });
    const book = await testPrisma.author.create({ data: { name: "[E2E_TEST] 新規著者" } });

    expect(created.id).toBe(4);
    expect(book.id).toBe(3);
  });

  it("移行先の値が 1 列でも違えば、照合が FAIL になる", async () => {
    const source = await snapshot();
    await resetTarget(target);
    await migrate(source.client(), target, { dbNull });
    await testPrisma.review.update({ where: { id: 2 }, data: { body: "[E2E_TEST] 改ざんされた感想" } });

    const failed = (await verifyAll(source.client(), target)).filter((c) => c.status === "FAIL");

    expect(failed).toEqual([{ table: "reviews", check: "列 body", status: "FAIL" }]);
  });

  it("書き込み先が空でないときは中断し、--reset 相当で空にすれば再実行できる（リハーサルのやり直し）", async () => {
    const source = await snapshot();

    await expect(assertTargetEmpty(target)).rejects.toThrow("書き込み先が空ではありません");
    await expect(migrate(source.client(), target, { dbNull })).rejects.toThrow("書き込み先が空ではありません");

    await resetTarget(target);
    await migrate(source.client(), target, { dbNull });
    await resetTarget(target);
    await migrate(source.client(), target, { dbNull });
    expect((await verifyAll(source.client(), target)).filter((c) => c.status === "FAIL")).toEqual([]);
  });
});
