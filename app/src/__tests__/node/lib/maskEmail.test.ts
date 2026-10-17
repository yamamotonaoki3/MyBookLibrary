import { maskEmail, maskEmailOrNull, maskEmailsDeep } from "@/lib/maskEmail";

describe("maskEmail", () => {
  it("先頭の数文字とドメインの先頭・末尾の区切りだけ残す", () => {
    expect(maskEmail("demo_mio@example.com")).toBe("de***@e***.com");
  });

  it("ローカル部が短いときは、1 文字だけ残す", () => {
    expect(maskEmail("ab@example.com")).toBe("a***@e***.com");
    expect(maskEmail("a@example.com")).toBe("a***@e***.com");
  });

  it("完全なアドレスを含まない", () => {
    const masked = maskEmail("test_user_001@example.co.jp");
    expect(masked).not.toContain("test_user_001");
    expect(masked).not.toContain("example");
  });

  it("形式が不正な値は、全体を隠す", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("user@")).toBe("***");
  });

  it("maskEmailOrNull は null / undefined をそのまま null にする", () => {
    expect(maskEmailOrNull(null)).toBeNull();
    expect(maskEmailOrNull(undefined)).toBeNull();
    expect(maskEmailOrNull("demo_mio@example.com")).toBe("de***@e***.com");
  });
});

describe("maskEmailsDeep", () => {
  it("文字列・配列・入れ子のオブジェクトの中のメールをマスクし、ほかの値は変えない", () => {
    const input = {
      from: "user",
      targetEmail: "demo_mio@example.com",
      note: "宛先: demo_sakura@example.com にお知らせ",
      list: ["demo_haruka@example.com", 3, null, true],
      nested: { count: 2, email: "demo_admin@example.com" },
    };
    const out = maskEmailsDeep(input);
    expect(out).toEqual({
      from: "user",
      targetEmail: "de***@e***.com",
      note: "宛先: de***@e***.com にお知らせ",
      list: ["de***@e***.com", 3, null, true],
      nested: { count: 2, email: "de***@e***.com" },
    });
    expect(JSON.stringify(out)).not.toContain("demo_mio");
  });

  it("null / 数値 / 真偽値はそのまま返す", () => {
    expect(maskEmailsDeep(null)).toBeNull();
    expect(maskEmailsDeep(5)).toBe(5);
    expect(maskEmailsDeep(false)).toBe(false);
  });
});
