/**
 * セッションの有効期間の方針（#736）。デモ環境（DEMO_MODE=true）だけ短くし、それ以外は Auth.js の既定のままにする。
 */
import { DEMO_SESSION_MAX_AGE_SECONDS, NO_REMEMBER_SESSION_MAX_AGE_SECONDS, sessionMaxAgeFor, sessionMaxAgeOption } from "@/lib/sessionPolicy";

const original = process.env.DEMO_MODE;

afterEach(() => {
  if (original === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = original;
});

describe("sessionMaxAgeOption", () => {
  it("DEMO_MODE=true では、放置から 15 分で切れる有効期間になる", () => {
    process.env.DEMO_MODE = "true";
    expect(sessionMaxAgeOption()).toEqual({ maxAge: DEMO_SESSION_MAX_AGE_SECONDS });
    expect(DEMO_SESSION_MAX_AGE_SECONDS).toBe(15 * 60);
  });

  it.each([undefined, "", "false", "TRUE", "1"])("DEMO_MODE=%p では、有効期間を指定しない（Auth.js の既定のまま）", (value) => {
    if (value === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = value;
    expect(sessionMaxAgeOption()).toEqual({});
    expect("maxAge" in sessionMaxAgeOption()).toBe(false);
  });
});

describe("sessionMaxAgeFor（ログイン保持なしは 8 時間。#737）", () => {
  const DAY = 24 * 60 * 60;

  it("保持なし（rememberMe=false）は、8 時間", () => {
    expect(sessionMaxAgeFor({ rememberMe: false }, 30 * DAY)).toBe(8 * 60 * 60);
    expect(NO_REMEMBER_SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
  });

  it.each([[{ rememberMe: true }], [{}], [undefined], [null], [{ rememberMe: "0" }]])("保持あり・旧トークン・不明な値（%p）は、既定のまま（30 日）", (token) => {
    expect(sessionMaxAgeFor(token as never, 30 * DAY)).toBe(30 * DAY);
  });

  it("既定の期間を渡さなければ、30 日", () => {
    expect(sessionMaxAgeFor({ rememberMe: true })).toBe(30 * DAY);
    expect(sessionMaxAgeFor({ rememberMe: false })).toBe(8 * 60 * 60);
  });

  it("既定の期間が 8 時間より短ければ（デモの 15 分）、保持なしでも、そちらを使う", () => {
    expect(sessionMaxAgeFor({ rememberMe: false }, DEMO_SESSION_MAX_AGE_SECONDS)).toBe(DEMO_SESSION_MAX_AGE_SECONDS);
  });
});
