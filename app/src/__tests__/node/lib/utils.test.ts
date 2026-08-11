import { cn } from "@/lib/utils";

describe("cn", () => {
  it("複数のクラス名を空白区切りで結合する", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("falsy な値（false, undefined, null, 空文字）は無視する", () => {
    expect(cn("px-2", false, undefined, null, "", "py-4")).toBe("px-2 py-4");
  });

  it("同じプロパティを指すTailwindクラスが競合する場合は後勝ちでマージする", () => {
    // tailwind-merge の役割: px-2 と px-4 はどちらも padding-x を指定するため、
    // 後に指定した px-4 のみが残る（clsx だけなら両方残ってしまう）。
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("オブジェクト形式の条件付きクラスを解決する", () => {
    expect(cn({ "text-red-500": true, "text-blue-500": false })).toBe("text-red-500");
  });

  it("配列形式のクラスをフラット化する", () => {
    expect(cn(["px-2", "py-4"], "font-bold")).toBe("px-2 py-4 font-bold");
  });

  it("引数なしの場合は空文字を返す", () => {
    expect(cn()).toBe("");
  });
});
