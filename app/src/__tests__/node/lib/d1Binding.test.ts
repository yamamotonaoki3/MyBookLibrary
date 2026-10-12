import { getD1Binding, registerD1Binding } from "@/lib/d1Binding";

const CONTEXT = Symbol.for("__cloudflare-context__");
const globalScope = globalThis as unknown as Record<symbol, unknown>;

describe("getD1Binding", () => {
  afterEach(() => {
    registerD1Binding(undefined);
    delete globalScope[CONTEXT];
  });

  it("Workers のコンテキスト（env.DB）があれば、それを返す", () => {
    const db = { name: "from-context" };
    globalScope[CONTEXT] = { env: { DB: db } };

    expect(getD1Binding()).toBe(db);
  });

  it("コンテキストがなければ、登録されたバインディングを返す", () => {
    const db = { name: "registered" };
    registerD1Binding(db);

    expect(getD1Binding()).toBe(db);
  });

  it("コンテキストと登録の両方があれば、コンテキストを優先する", () => {
    const fromContext = { name: "from-context" };
    globalScope[CONTEXT] = { env: { DB: fromContext } };
    registerD1Binding({ name: "registered" });

    expect(getD1Binding()).toBe(fromContext);
  });

  it("env に DB がなければ、登録されたバインディングへフォールバックする", () => {
    const db = { name: "registered" };
    globalScope[CONTEXT] = { env: {} };
    registerD1Binding(db);

    expect(getD1Binding()).toBe(db);
  });

  it("どちらもなければ、原因が分かるエラーを投げる", () => {
    expect(() => getD1Binding()).toThrow(/D1 のバインディング（DB）が見つかりません/);
  });
});
