import { assertSourceUrlIsLocal, assertWritableTarget, PRODUCTION_D1_ID, PRODUCTION_D1_NAME, safeErrorMessage } from "@/lib/migration/etl/guard";

const ID = "e788d5bf-9174-44f7-8ac0-934e81c08f32";

describe("assertSourceUrlIsLocal", () => {
  it("ローカルの MySQL は許可する", () => {
    expect(() => assertSourceUrlIsLocal("mysql://user:pass@localhost:3307/db")).not.toThrow();
    expect(() => assertSourceUrlIsLocal("mysql://user:pass@127.0.0.1:3306/db")).not.toThrow();
  });

  it("未設定・不正な URL・mysql 以外・ローカル以外のホストは拒否する", () => {
    expect(() => assertSourceUrlIsLocal(undefined)).toThrow("未設定");
    expect(() => assertSourceUrlIsLocal("not a url")).toThrow("不正");
    expect(() => assertSourceUrlIsLocal("postgres://u:p@localhost/db")).toThrow("mysql://");
    expect(() => assertSourceUrlIsLocal("mysql://u:p@db.example.com/db")).toThrow("ローカル");
  });

  it("エラーメッセージに接続文字列（パスワード）を含めない", () => {
    try {
      assertSourceUrlIsLocal("mysql://user:s3cret-pass@db.example.com/db");
    } catch (error) {
      expect((error as Error).message).not.toContain("s3cret-pass");
      expect((error as Error).message).not.toContain("db.example.com");
    }
  });
});

describe("assertWritableTarget", () => {
  it("--local か --remote のどちらか一方が必要", () => {
    expect(() => assertWritableTarget({ local: false, remote: false })).toThrow("どちらか一方");
    expect(() => assertWritableTarget({ local: true, remote: true })).toThrow("どちらか一方");
  });

  it("--local は D1 の名前・ID を指定できない", () => {
    expect(assertWritableTarget({ local: true, remote: false })).toMatchObject({ remote: false });
    expect(() => assertWritableTarget({ local: true, remote: false, d1Name: "x" })).toThrow();
  });

  it("--remote は、名前と UUID 形式の ID が必要", () => {
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: "mybooklibrary-staging-db" })).toThrow("両方");
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: "x", d1Id: "bad" })).toThrow("UUID");
    expect(assertWritableTarget({ local: false, remote: true, d1Name: "mybooklibrary-staging-db", d1Id: ID })).toEqual({
      remote: true,
      name: "mybooklibrary-staging-db",
      id: ID,
    });
  });

  it("本番の D1 は、確認の指定がなければ拒否する", () => {
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: PRODUCTION_D1_NAME, d1Id: ID })).toThrow("本番の D1");
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: PRODUCTION_D1_NAME, d1Id: ID, confirmProduction: "other" })).toThrow("本番の D1");
    expect(assertWritableTarget({ local: false, remote: true, d1Name: PRODUCTION_D1_NAME, d1Id: ID, confirmProduction: PRODUCTION_D1_NAME })).toMatchObject({ remote: true });
  });

  it("名前を変えても、本番の D1 の ID なら拒否する", () => {
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: "mybooklibrary-staging-db", d1Id: PRODUCTION_D1_ID })).toThrow("本番の D1");
    expect(() => assertWritableTarget({ local: false, remote: true, d1Name: "x", d1Id: PRODUCTION_D1_ID.toUpperCase() })).toThrow("本番の D1");
  });
});

describe("safeErrorMessage", () => {
  it("Prisma のエラーは、値を含む本文を出さず、種類と最初の 1 行だけにする", () => {
    const error = Object.assign(new Error("Invalid `prisma.user.createMany()` invocation:\n\n  data: [{ email: \"secret-person@example.com\", body: \"private text\" }]"), {
      name: "PrismaClientValidationError",
    });

    const message = safeErrorMessage(error);

    expect(message).toContain("PrismaClientValidationError");
    expect(message).toContain("prisma.user.createMany");
    expect(message).not.toContain("secret-person");
    expect(message).not.toContain("private text");
  });

  it("コードを持つ Prisma のエラーは、コードを示す", () => {
    const error = Object.assign(new Error("Invalid invocation:\nUnique constraint failed on email=a@example.com"), { name: "PrismaClientKnownRequestError", code: "P2002" });

    expect(safeErrorMessage(error)).toContain("P2002");
    expect(safeErrorMessage(error)).not.toContain("a@example.com");
    expect(safeErrorMessage(Object.assign(new Error("Unique constraint failed on email=a@example.com"), { name: "PrismaClientKnownRequestError", code: "P2002" }))).not.toContain("a@example.com");
  });

  it("このツール自身のエラーは、そのまま返す", () => {
    expect(safeErrorMessage(new Error("書き込み先が空ではありません（users）。"))).toBe("書き込み先が空ではありません（users）。");
    expect(safeErrorMessage("x")).toBe("不明なエラーです。");
  });
});
