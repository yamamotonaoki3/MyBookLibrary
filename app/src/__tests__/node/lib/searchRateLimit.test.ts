import { getSearchRateLimitIntervalMs } from "@/lib/searchRateLimit";

describe("getSearchRateLimitIntervalMs", () => {
  it("未設定では500ms", () => {
    expect(getSearchRateLimitIntervalMs({})).toBe(500);
  });
  it.each(["", "   ", "abc", "-1", "Infinity", "NaN"])("不正値 %s は500ms", (value) => {
    expect(getSearchRateLimitIntervalMs({ SEARCH_RATE_LIMIT_INTERVAL_MS: value })).toBe(500);
  });
  it.each([["1200", 1200], ["0", 0]])("%s で上書きできる", (value, expected) => {
    expect(getSearchRateLimitIntervalMs({ SEARCH_RATE_LIMIT_INTERVAL_MS: value })).toBe(expected);
  });
});
