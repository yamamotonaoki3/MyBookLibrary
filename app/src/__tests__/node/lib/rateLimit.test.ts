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

  describe("古いエントリの間引き", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // 注意: 間引きの有無は isRateLimited() の戻り値からは観測できない。
    // staleThreshold（intervalMs*10）は必ず intervalMs より大きいため、
    // 間引かれたキーへの再呼び出しも、間引かれていないキーへの再呼び出しも、
    // どちらも「intervalMs を過ぎている」ため false（制限なし）を返す。
    // つまり Map からエントリが実際に削除されたかどうかは、公開APIの
    // 戻り値だけでは区別できない（内部状態を露出しないと検証不能）。
    // ここでは「大量のキーが古くなった状態で例外なく動き続けること」を
    // スモークテストとして確認するに留める。
    it("大量の古いキーが蓄積した状態でも例外を投げずに動作し続ける", () => {
      for (let i = 0; i < 50; i++) {
        isRateLimited(`stale-user:${i}`, 100);
      }

      // 全キーが staleThreshold（100ms*10=1000ms）を超えるまで時間を進める
      jest.advanceTimersByTime(1001);

      expect(() => isRateLimited("trigger-prune", 100)).not.toThrow();
      expect(isRateLimited("trigger-prune", 100)).toBe(true);
    });
  });
});
