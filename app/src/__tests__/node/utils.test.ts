import { normalizeAuthorName } from "@/lib/normalizeAuthorName";

describe("normalizeAuthorName", () => {
  it("全角スペースを除去する", () => {
    expect(normalizeAuthorName("村上　春樹")).toBe("村上春樹");
  });

  it("半角スペースを除去する", () => {
    expect(normalizeAuthorName("村上 春樹")).toBe("村上春樹");
  });

  it("複数の空白を全て除去する", () => {
    expect(normalizeAuthorName("村 上　春 樹")).toBe("村上春樹");
  });

  it("スペースなしの名前はそのまま返す", () => {
    expect(normalizeAuthorName("夏目漱石")).toBe("夏目漱石");
  });

  it("空文字は空文字を返す", () => {
    expect(normalizeAuthorName("")).toBe("");
  });

  it("前後の空白も除去する", () => {
    expect(normalizeAuthorName("  村上春樹  ")).toBe("村上春樹");
  });
});
