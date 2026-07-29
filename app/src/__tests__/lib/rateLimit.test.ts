import { isRateLimited, resetRateLimits } from "@/lib/rateLimit";

describe("isRateLimited", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("同一キーへの連続呼び出しは間隔未満なら true（制限あり）を返す", () => {
    expect(isRateLimited("user:1", 500)).toBe(false);
    expect(isRateLimited("user:1", 500)).toBe(true);
  });

  it("十分な間隔を空ければ false（制限なし）を返す", async () => {
    expect(isRateLimited("user:2", 10)).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(isRateLimited("user:2", 10)).toBe(false);
  });

  it("キーが異なれば互いに影響しない", () => {
    expect(isRateLimited("user:3", 500)).toBe(false);
    expect(isRateLimited("user:4", 500)).toBe(false);
  });

  it("resetRateLimits() で状態がクリアされる", () => {
    expect(isRateLimited("user:5", 500)).toBe(false);
    resetRateLimits();
    expect(isRateLimited("user:5", 500)).toBe(false);
  });
});
