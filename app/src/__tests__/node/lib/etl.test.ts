import { Prisma } from "@/generated/prisma";
import { canonicalize, combineDigests, sha256 } from "@/lib/migration/etl/canonical";
import { DEMO_MASTER_TABLES, MIGRATION_TABLES } from "@/lib/migration/etl/tables";
import { FakeDb } from "../../helpers/etlFakeDb";
import {
  assertNoEmailCollisions,
  assertNoJsonNullValues,
  assertSourceNotEmpty,
  migrate,
  resetTarget,
  verifyAll,
  verifyForeignKeys,
  verifySequences,
  verifyTables,
} from "@/lib/migration/etl/run";

const modelName = (name: string) => name[0].toLowerCase() + name.slice(1);

describe("MIGRATION_TABLES（スキーマとの整合）", () => {
  const models = Prisma.dmmf.datamodel.models;

  it("スキーマの全モデルを、重複なく 1 回ずつ含む", () => {
    expect(MIGRATION_TABLES.map((t) => t.model).sort()).toEqual(models.map((m) => modelName(m.name)).sort());
  });

  it("外部キーの親が、必ず子より先に並んでいる（自己参照を除く）", () => {
    const order = new Map(MIGRATION_TABLES.map((t, index) => [t.model, index]));
    for (const model of models) {
      for (const field of model.fields) {
        if (field.kind !== "object" || !field.relationFromFields || field.relationFromFields.length === 0) continue;
        const parent = modelName(field.type);
        if (parent === modelName(model.name)) continue;
        expect({ child: modelName(model.name), parent, ok: order.get(parent)! < order.get(modelName(model.name))! }).toEqual({
          child: modelName(model.name),
          parent,
          ok: true,
        });
      }
    }
  });

  it("Json 列の一覧が、スキーマと一致する", () => {
    const fromSchema = models.flatMap((m) => m.fields.filter((f) => f.type === "Json").map((f) => `${modelName(m.name)}.${f.name}`)).sort();
    const fromTables = MIGRATION_TABLES.flatMap((t) => (t.jsonColumns ?? []).map((column) => `${t.model}.${column}`)).sort();
    expect(fromTables).toEqual(fromSchema);
  });

  it("照合キーの列が、実在する", () => {
    for (const spec of MIGRATION_TABLES) {
      const fields = new Set(models.find((m) => modelName(m.name) === spec.model)!.fields.map((f) => f.name));
      for (const key of spec.orderBy) expect(fields.has(key)).toBe(true);
    }
  });
});

describe("canonicalize / combineDigests", () => {
  it("型の違い（数値と文字列、null と空文字）を区別する", () => {
    expect(canonicalize(1)).not.toBe(canonicalize("1"));
    expect(canonicalize(null)).not.toBe(canonicalize(""));
    expect(canonicalize(true)).not.toBe(canonicalize(1));
  });

  it("日時はミリ秒まで区別する", () => {
    expect(canonicalize(new Date("2026-01-01T00:00:00.001Z"))).not.toBe(canonicalize(new Date("2026-01-01T00:00:00.000Z")));
  });

  it("Json はキーの順序によらず同じ表現になる", () => {
    expect(canonicalize({ a: 1, b: { c: [1, 2] } })).toBe(canonicalize({ b: { c: [1, 2] }, a: 1 }));
  });

  it("日本語と絵文字は、正規化形（NFC / NFD）の違いを区別する", () => {
    expect(sha256(canonicalize("が".normalize("NFC")))).not.toBe(sha256(canonicalize("が".normalize("NFD"))));
  });

  it("combineDigests は、行の並び順によらず同じ値になる", () => {
    const a = new Map([["k1", "x"], ["k2", "y"]]);
    const b = new Map([["k2", "y"], ["k1", "x"]]);
    expect(combineDigests(a)).toBe(combineDigests(b));
    expect(combineDigests(new Map([["k1", "x"], ["k2", "z"]]))).not.toBe(combineDigests(a));
  });
});

function sourceDb(): FakeDb {
  const db = new FakeDb();
  db.tables.set("user", [
    { id: 1, email: "Alice@Example.com", name: "テスト太郎", password: "$2b$10$abcdefghijklmnopqrstuv", createdAt: new Date("2026-01-01T00:00:00.123Z") },
    { id: 2, email: "bob@example.com", name: "E2EUser B", password: null, createdAt: new Date("2026-01-02T00:00:00.000Z") },
  ]);
  db.tables.set("author", [{ id: 1, name: "テスト著者" }]);
  db.tables.set("auditLog", [{ id: 1, action: "x", detail: null }, { id: 2, action: "y", detail: { k: [1, 2] } }]);
  db.tables.set("verificationToken", [
    { identifier: "a@example.com", token: "t2", expires: new Date("2026-02-01T00:00:00.000Z") },
    { identifier: "a@example.com", token: "t1", expires: new Date("2026-02-01T00:00:00.000Z") },
  ]);
  return db;
}

describe("移行元が空のとき（ダンプの復元の失敗に気づく。#755）", () => {
  it("users も books も 0 件なら、何も書かずに中断する", async () => {
    const target = new FakeDb();

    await expect(migrate(new FakeDb().client(), target.client())).rejects.toThrow("移行元が空です");
    expect(target.tables.get("user")).toEqual([]);
    expect(target.tables.get("book")).toEqual([]);
  });

  it("メッセージに、確認する点と、例外の指定方法を示す", async () => {
    const error = await migrate(new FakeDb().client(), new FakeDb().client()).catch((e: Error) => e);
    expect((error as Error).message).toContain("users・books");
    expect((error as Error).message).toContain("--allow-empty-source");
  });

  it("allowEmptySource を指定すれば、空を移せる", async () => {
    const summaries = await migrate(new FakeDb().client(), new FakeDb().client(), { allowEmptySource: true });
    expect(summaries.every((s) => s.written === 0)).toBe(true);
  });

  it("users か books のどちらかが 1 件でもあれば、中断しない", async () => {
    const onlyUsers = new FakeDb();
    onlyUsers.tables.set("user", [{ id: 1 }]);
    await expect(assertSourceNotEmpty(onlyUsers.client())).resolves.toBeUndefined();

    const onlyBooks = new FakeDb();
    onlyBooks.tables.set("book", [{ id: 1 }]);
    await expect(assertSourceNotEmpty(onlyBooks.client())).resolves.toBeUndefined();
  });

  it("users 以外の表（authors など）だけにデータがあっても、users と books が空なら中断する", async () => {
    const db = new FakeDb();
    db.tables.set("author", [{ id: 1, name: "テスト著者" }]);
    await expect(assertSourceNotEmpty(db.client())).rejects.toThrow("移行元が空です");
  });

  it("デモ用の表（users を移さない）は、books だけで判断する", async () => {
    await expect(assertSourceNotEmpty(new FakeDb().client(), DEMO_MASTER_TABLES)).rejects.toThrow("books が 0 件");

    const db = new FakeDb();
    db.tables.set("book", [{ id: 1 }]);
    await expect(assertSourceNotEmpty(db.client(), DEMO_MASTER_TABLES)).resolves.toBeUndefined();
  });
});

const DB_NULL = Symbol("DbNull");

describe("migrate", () => {
  it("全テーブルを順に移し、メールを小文字化し、Json の NULL を dbNull に変える", async () => {
    const source = sourceDb();
    const target = new FakeDb();

    const summaries = await migrate(source.client(), target.client(), { pageSize: 1, dbNull: DB_NULL });

    expect(summaries.map((s) => s.table)).toEqual(MIGRATION_TABLES.map((t) => t.table));
    expect(target.tables.get("user")!.map((u) => u.email)).toEqual(["alice@example.com", "bob@example.com"]);
    // 変換対象外の列は、そのまま（ハッシュ・日本語・ミリ秒）
    expect(target.tables.get("user")![0]).toMatchObject({ name: "テスト太郎", password: "$2b$10$abcdefghijklmnopqrstuv", createdAt: new Date("2026-01-01T00:00:00.123Z") });
    expect(target.tables.get("auditLog")!.map((r) => r.detail)).toEqual([DB_NULL, { k: [1, 2] }]);
    expect(target.tables.get("verificationToken")!.length).toBe(2);
    // 移行元は変更しない
    expect(source.tables.get("user")![0].email).toBe("Alice@Example.com");
  });

  it("書き込み先が空でないときは、何も書かずに中断する", async () => {
    const target = new FakeDb();
    target.tables.set("author", [{ id: 9, name: "既存" }]);

    await expect(migrate(sourceDb().client(), target.client())).rejects.toThrow("書き込み先が空ではありません");
    expect(target.tables.get("user")).toEqual([]);
  });

  it("小文字化すると重複するメールがあれば、何も書かずに中断する（件数だけを示し、値は示さない）", async () => {
    const source = sourceDb();
    source.tables.get("user")!.push({ id: 3, email: "ALICE@example.com ", name: "dup" });
    const target = new FakeDb();

    const error = await migrate(source.client(), target.client()).catch((e: Error) => e);

    expect((error as Error).message).toContain("1 件");
    expect((error as Error).message).not.toContain("example.com");
    expect(target.tables.get("author")).toEqual([]);
    await expect(assertNoEmailCollisions(source.client())).rejects.toThrow();
  });

  it("移行元の Json 列に JSON の null があれば、何も書かずに中断する", async () => {
    const source = sourceDb();
    source.jsonNullCount = 2;
    const target = new FakeDb();

    await expect(migrate(source.client(), target.client())).rejects.toThrow("JSON の null の値が 2 件");
    expect(target.tables.get("author")).toEqual([]);
    await expect(assertNoJsonNullValues(sourceDb().client())).resolves.toBeUndefined();
  });

  it("書き込みの失敗は、書き込もうとした値を含めずに、表名とともに示す", async () => {
    const target = new FakeDb();
    const client = target.client();
    (client as unknown as Record<string, { createMany: unknown }>).user.createMany = async () => {
      throw Object.assign(new Error("Invalid `prisma.user.createMany()` invocation:\n data: { email: \"alice@example.com\" }"), { name: "PrismaClientValidationError" });
    };

    const error = (await migrate(sourceDb().client(), client).catch((e: Error) => e)) as Error;

    expect(error.message).toContain("users: 書き込みに失敗しました");
    expect(error.message).not.toContain("alice@example.com");
  });

  it("書き込みの件数が移行元と合わなければ中断する", async () => {
    const target = new FakeDb();
    const client = target.client();
    const author = (client as unknown as Record<string, { createMany: unknown }>).author;
    author.createMany = async () => ({ count: 0 });

    await expect(migrate(sourceDb().client(), client)).rejects.toThrow("書き込みは 0 件");
  });
});

describe("resetTarget", () => {
  it("外部キーの子 → 親の順に空にする", async () => {
    const target = new FakeDb();

    await resetTarget(target.client());

    expect(target.deleteOrder).toEqual([...MIGRATION_TABLES].reverse().map((t) => t.model));
  });
});

describe("verifyTables / verifyAll", () => {
  async function migrated() {
    const source = sourceDb();
    const target = new FakeDb();
    await migrate(source.client(), target.client(), { dbNull: null });
    return { source, target };
  }

  it("移行直後は、すべて PASS（メールの小文字化は期待される変換として扱う）", async () => {
    const { source, target } = await migrated();
    // 移行先の Json の NULL は、Prisma が読み出すとき null になる
    const checks = await verifyTables(source.client(), target.client(), 1);

    expect(checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(checks.some((c) => c.table === "users" && c.check === "列 email")).toBe(true);
  });

  it("値が 1 列だけ違うと、その列だけ FAIL になる（値は結果に含めない）", async () => {
    const { source, target } = await migrated();
    target.tables.get("user")![0].name = "テスト次郎";

    const failed = (await verifyTables(source.client(), target.client())).filter((c) => c.status === "FAIL");

    expect(failed).toEqual([{ table: "users", check: "列 name", status: "FAIL" }]);
  });

  it("複合キーが、区切り文字を含む別の値と衝突しても、行の欠落を見逃さない", async () => {
    const source = sourceDb();
    source.tables.set("verificationToken", [
      { identifier: "a|b", token: "c", expires: new Date("2026-02-01T00:00:00.000Z") },
      { identifier: "a", token: "b|c", expires: new Date("2026-02-01T00:00:00.000Z") },
    ]);
    const target = new FakeDb();
    await migrate(source.client(), target.client());
    target.tables.get("verificationToken")!.pop();

    const failed = (await verifyTables(source.client(), target.client())).filter((c) => c.status === "FAIL");

    expect(failed.map((c) => `${c.table}:${c.check}`)).toEqual(expect.arrayContaining(["verification_tokens:件数", "verification_tokens:キーの集合"]));
  });

  it("移行先に、同じキーの行が重複していれば FAIL にする", async () => {
    const { source, target } = await migrated();
    target.tables.get("author")!.push({ ...target.tables.get("author")![0] });

    const failed = (await verifyTables(source.client(), target.client())).filter((c) => c.status === "FAIL");

    expect(failed.map((c) => `${c.table}:${c.check}`)).toEqual(expect.arrayContaining(["authors:キーの重複", "authors:件数"]));
  });

  it("行の欠落・余剰・件数の違いを検出する", async () => {
    const { source, target } = await migrated();
    target.tables.get("author")!.pop();
    target.tables.get("award")!.push({ id: 7, name: "余分" });

    const failed = (await verifyTables(source.client(), target.client())).filter((c) => c.status === "FAIL");

    expect(failed.map((c) => `${c.table}:${c.check}`)).toEqual(
      expect.arrayContaining(["authors:件数", "authors:キーの集合", "awards:件数", "awards:キーの集合"])
    );
  });

  it("メールを小文字化していない移行は、FAIL にする（変換が必ず行われたことの検査）", async () => {
    const { source, target } = await migrated();
    target.tables.get("user")![0].email = "Alice@Example.com";

    const failed = (await verifyTables(source.client(), target.client())).filter((c) => c.status === "FAIL");

    expect(failed).toEqual([{ table: "users", check: "列 email", status: "FAIL" }]);
  });

  it("照合だけを実行しても、移行元の JSON の null を FAIL として検出する", async () => {
    const { source, target } = await migrated();
    source.jsonNullCount = 1;

    const failed = (await verifyAll(source.client(), target.client())).filter((c) => c.status === "FAIL" && c.table === "Json 列");

    expect(failed.map((c) => c.check)).toEqual(["移行元に JSON の null がない"]);
  });

  it("外部キー違反があれば FAIL、採番が最大 ID に届いていなければ FAIL", async () => {
    const { source, target } = await migrated();
    expect((await verifyForeignKeys(target.client())).status).toBe("PASS");
    target.foreignKeyViolations = [{ table: "books", rowid: 1, parent: "authors", fkid: 0 }];
    expect((await verifyForeignKeys(target.client())).status).toBe("FAIL");

    target.sequences = [{ name: "users", seq: 1 }, { name: "authors", seq: 1 }, { name: "audit_logs", seq: 2 }];
    const sequences = await verifySequences(target.client());
    expect(sequences.find((c) => c.table === "users")).toMatchObject({ status: "FAIL" });
    expect(sequences.find((c) => c.table === "authors")).toMatchObject({ status: "PASS" });
    expect(sequences.find((c) => c.table === "audit_logs")).toMatchObject({ status: "PASS" });

    const all = await verifyAll(source.client(), target.client());
    expect(all.some((c) => c.status === "FAIL")).toBe(true);
  });
});
