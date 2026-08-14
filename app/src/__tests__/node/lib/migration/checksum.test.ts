import { computeSha256 } from "@/lib/migration/checksum";

describe("computeSha256", () => {
  it("既知の入力に対して既知のSHA-256値を返す", () => {
    // echo -n "example" | sha256sum の結果と一致することを確認する。
    const hash = computeSha256(Buffer.from("example", "utf-8"));
    expect(hash).toBe(
      "50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c"
    );
  });

  it("同じ入力からは常に同じハッシュ値を返す（冪等性）", () => {
    const data = Buffer.from("testuser_001@example.com", "utf-8");
    expect(computeSha256(data)).toBe(computeSha256(data));
  });

  it("入力が異なればハッシュ値も異なる", () => {
    const a = computeSha256(Buffer.from("dump-a", "utf-8"));
    const b = computeSha256(Buffer.from("dump-b", "utf-8"));
    expect(a).not.toBe(b);
  });
});
