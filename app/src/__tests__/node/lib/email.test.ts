import { normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("大文字を小文字にする", () => {
    expect(normalizeEmail("Test.User@Example.COM")).toBe("test.user@example.com");
  });

  it("前後の空白を取り除く", () => {
    expect(normalizeEmail("  user@example.com \n")).toBe("user@example.com");
  });

  it("すでに正規化済みの値は変えない", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});
