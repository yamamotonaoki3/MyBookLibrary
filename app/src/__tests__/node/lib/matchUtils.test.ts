import { isPlausibleMatch } from "@/lib/matchUtils";

describe("isPlausibleMatch", () => {
  it("同一著者・同一タイトルは一致とみなす", () => {
    expect(
      isPlausibleMatch({ title: "火花", author: "又吉直樹" }, { title: "火花", author: "又吉直樹" })
    ).toBe(true);
  });

  it("同一著者でも別タイトルは一致とみなさない（島田雅彦の別作品による誤マッチ再現）", () => {
    expect(
      isPlausibleMatch(
        { title: "夢遊王国のための音楽", author: "島田雅彦" },
        { title: "亡命旅行者は叫び呟く", author: "島田雅彦" }
      )
    ).toBe(false);
  });

  it("著者が異なる場合は一致とみなさない", () => {
    expect(
      isPlausibleMatch({ title: "火花", author: "湊かなえ" }, { title: "火花", author: "又吉直樹" })
    ).toBe(false);
  });

  it("著者名の表記ゆれ（全角スペース有無）は正規化して一致とみなす", () => {
    expect(
      isPlausibleMatch({ title: "こころ", author: "夏目　漱石" }, { title: "こころ", author: "夏目漱石" })
    ).toBe(true);
  });

  it("タイトルが一方を包含する場合（副題違い等）は一致とみなす", () => {
    expect(
      isPlausibleMatch(
        { title: "壁――Ｓ・カルマ氏の犯罪", author: "安部公房" },
        { title: "壁", author: "安部公房" }
      )
    ).toBe(true);
  });

  it("タイトル・著者いずれも空文字なら一致とみなさない", () => {
    expect(isPlausibleMatch({ title: "", author: "" }, { title: "", author: "" })).toBe(false);
  });
});
