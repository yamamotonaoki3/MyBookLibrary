/**
 * セッションの有効期間の方針（#736）。デモ環境（DEMO_MODE=true）だけ短くし、それ以外は Auth.js の既定のままにする。
 */
import { DEMO_SESSION_MAX_AGE_SECONDS, sessionMaxAgeOption } from "@/lib/sessionPolicy";

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
