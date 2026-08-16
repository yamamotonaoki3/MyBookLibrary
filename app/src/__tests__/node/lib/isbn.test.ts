import { isbn13ToIsbn10 } from "@/lib/isbn";

describe("isbn13ToIsbn10", () => {
  it("978プレフィックスのISBN-13を正しいチェックデジットのISBN-10に変換する", () => {
    // 町屋良平『しき』(河出文庫): ISBN-13 9784309417738 / ISBN-10 4309417736
    expect(isbn13ToIsbn10("9784309417738")).toBe("4309417736");
  });

  it("ハイフン付きのISBN-13でも同じ結果になる", () => {
    expect(isbn13ToIsbn10("978-4-309-41773-8")).toBe("4309417736");
  });

  it("チェックデジットがXになるケースを正しく変換する", () => {
    expect(isbn13ToIsbn10("9780000000060")).toBe("000000006X");
  });

  it("979プレフィックスはnullを返す（ISBN-10が存在しない）", () => {
    expect(isbn13ToIsbn10("9791234567896")).toBeNull();
  });

  it("978以外・桁数不正な文字列はnullを返す", () => {
    expect(isbn13ToIsbn10("1234567890123")).toBeNull();
    expect(isbn13ToIsbn10("97843094177")).toBeNull();
  });
});
