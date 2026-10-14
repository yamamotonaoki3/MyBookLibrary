import { DEMO_D1_ID, DEMO_D1_NAME, PRODUCTION_D1_ID, PRODUCTION_D1_NAME, assertProfileMatchesTarget } from "@/lib/migration/etl/guard";
import { migrate, verifyAll } from "@/lib/migration/etl/run";
import { DEMO_MASTER_TABLES, MIGRATION_TABLES } from "@/lib/migration/etl/tables";
import { FakeDb } from "../../helpers/etlFakeDb";

const STAGING_ID = "e788d5bf-9174-44f7-8ac0-934e81c08f32";

describe("DEMO_MASTER_TABLES（デモ用 D1 へ投入する表）", () => {
  it("マスターデータの 5 表だけで、ユーザー関連の表を含まない", () => {
    expect(DEMO_MASTER_TABLES.map((t) => t.table)).toEqual(["authors", "awards", "books", "book_isbns", "award_entries"]);
  });

  it("全テーブルの移行順序の部分列になっている（外部キーの親 → 子の順が保たれる）", () => {
    const order = MIGRATION_TABLES.map((t) => t.model);
    const indexes = DEMO_MASTER_TABLES.map((t) => order.indexOf(t.model));
    expect(indexes.every((i) => i >= 0)).toBe(true);
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });
});

describe("assertProfileMatchesTarget", () => {
  it("demo は、名前と ID がデモの D1 と一致するリモートと、ローカルだけを許可する", () => {
    expect(() => assertProfileMatches("demo", { remote: true, name: DEMO_D1_NAME, id: DEMO_D1_ID })).not.toThrow();
    expect(() => assertProfileMatches("demo", { remote: false, name: "mybooklibrary-local", id: "00000000-0000-0000-0000-000000000000" })).not.toThrow();
  });

  it("demo は、本番・ステージングなど、他の D1 を拒否する", () => {
    expect(() => assertProfileMatches("demo", { remote: true, name: PRODUCTION_D1_NAME, id: PRODUCTION_D1_ID })).toThrow("デモの D1");
    expect(() => assertProfileMatches("demo", { remote: true, name: "mybooklibrary-staging-db", id: STAGING_ID })).toThrow("デモの D1");
  });

  it("demo は、名前だけ、または ID だけがデモの D1 と一致する場合も拒否する", () => {
    expect(() => assertProfileMatches("demo", { remote: true, name: DEMO_D1_NAME, id: STAGING_ID })).toThrow("デモの D1");
    expect(() => assertProfileMatches("demo", { remote: true, name: "mybooklibrary-staging-db", id: DEMO_D1_ID })).toThrow("デモの D1");
  });

  it("全テーブルの移行は、デモの D1 を（名前でも ID でも）拒否する", () => {
    expect(() => assertProfileMatches("full", { remote: true, name: DEMO_D1_NAME, id: STAGING_ID })).toThrow("デモの D1 には");
    expect(() => assertProfileMatches("full", { remote: true, name: "x", id: DEMO_D1_ID.toUpperCase() })).toThrow("デモの D1 には");
    expect(() => assertProfileMatches("full", { remote: true, name: "mybooklibrary-staging-db", id: STAGING_ID })).not.toThrow();
  });
});

function assertProfileMatches(profile: "full" | "demo", target: { remote: boolean; name: string; id: string }) {
  assertProfileMatchesTarget(profile, target);
}

function sourceDb(): FakeDb {
  const db = new FakeDb();
  // ユーザー等も持つ移行元。デモ用のプロファイルでは、これらは移されない
  db.tables.set("user", [{ id: 1, email: "Alice@Example.com", name: "テスト太郎", password: null }]);
  db.tables.set("review", [{ id: 1, userId: 1, bookId: 1, body: "[E2E_TEST] 感想" }]);
  db.tables.set("author", [{ id: 1, name: "テスト著者" }]);
  db.tables.set("award", [{ id: 1, name: "テスト賞" }]);
  db.tables.set("book", [
    { id: 1, authorId: 1, title: "テスト本 A", isbn: "9780000000001", createdByUserId: 1 },
    { id: 2, authorId: 1, title: "テスト本 B", isbn: null, createdByUserId: null },
  ]);
  db.tables.set("bookIsbn", [{ id: 1, bookId: 1, isbn: "9780000000001", isPrimary: true }]);
  db.tables.set("awardEntry", [{ id: 1, bookId: 1, awardId: 1, year: 2026, type: "受賞" }]);
  return db;
}

describe("デモ用プロファイルの移行", () => {
  it("マスターデータだけを移し、本の登録者は空にする（ユーザー・レビューなどは移さない）", async () => {
    const source = sourceDb();
    const target = new FakeDb();

    const summaries = await migrate(source.client(), target.client(), { tables: DEMO_MASTER_TABLES, pageSize: 1 });

    expect(summaries.map((s) => s.table)).toEqual(["authors", "awards", "books", "book_isbns", "award_entries"]);
    expect(target.tables.get("book")!.map((b) => b.createdByUserId)).toEqual([null, null]);
    expect(target.tables.get("book")!.map((b) => b.title)).toEqual(["テスト本 A", "テスト本 B"]);
    expect(target.tables.get("user")).toEqual([]);
    expect(target.tables.get("review")).toEqual([]);
    // 移行元は変更しない
    expect(source.tables.get("book")![0].createdByUserId).toBe(1);
  });

  it("移行元に、小文字化すると重複するメールや JSON の null があっても、マスターデータの移行は妨げられない", async () => {
    const source = sourceDb();
    source.tables.set("user", [
      { id: 1, email: "A@Example.com", name: "a" },
      { id: 2, email: "a@example.com", name: "b" },
    ]);
    source.jsonNullCount = 3;

    await expect(migrate(source.client(), new FakeDb().client(), { tables: DEMO_MASTER_TABLES })).resolves.toHaveLength(5);
  });

  it("書き込み先のマスターデータが空でないときは、何も書かずに中断する", async () => {
    const target = new FakeDb();
    target.tables.set("author", [{ id: 9, name: "既存" }]);

    await expect(migrate(sourceDb().client(), target.client(), { tables: DEMO_MASTER_TABLES })).rejects.toThrow("書き込み先が空ではありません");
    expect(target.tables.get("award")).toEqual([]);
  });

  it("照合は、マスターデータの 5 表だけを、登録者を空にした値と比べて行う", async () => {
    const source = sourceDb();
    const target = new FakeDb();
    target.sequences = ["authors", "awards", "books", "book_isbns", "award_entries"].map((name) => ({ name, seq: 10 }));
    await migrate(source.client(), target.client(), { tables: DEMO_MASTER_TABLES });

    const checks = await verifyAll(source.client(), target.client(), 50, DEMO_MASTER_TABLES);

    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(new Set(checks.map((c) => c.table))).toEqual(new Set(["authors", "awards", "books", "book_isbns", "award_entries", "全テーブル"]));
    // 値が違えば検出する
    target.tables.get("book")![0].title = "改ざん";
    const broken = await verifyAll(source.client(), target.client(), 50, DEMO_MASTER_TABLES);
    expect(broken.filter((c) => c.status === "FAIL").map((c) => `${c.table}/${c.check}`)).toEqual(["books/列 title"]);
  });
});
