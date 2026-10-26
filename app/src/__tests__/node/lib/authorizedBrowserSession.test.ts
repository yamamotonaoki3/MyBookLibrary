jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));

import { authConfig } from "@/auth.config";
import { BROWSER_SESSION_COOKIE, isBrowserSessionAlive } from "@/lib/sessionPolicy";

type Case = { rememberMe?: boolean; cookie: boolean };

function authorizedFor(pathname: string, user: Case | null) {
  const authorized = authConfig.callbacks?.authorized as (args: unknown) => unknown;
  return authorized({
    auth: user ? { user: { email: "user@example.com", role: "user", rememberMe: user.rememberMe } } : null,
    request: {
      nextUrl: new URL(`https://example.com${pathname}`),
      cookies: { get: (name: string) => (user?.cookie && name === BROWSER_SESSION_COOKIE ? { name, value: "1" } : undefined) },
    },
  });
}

function isRedirectTo(result: unknown, pathname: string): boolean {
  return result instanceof Response && result.status >= 300 && result.status < 400 && new URL(result.headers.get("location") ?? "").pathname === pathname;
}

describe("isBrowserSessionAlive", () => {
  it.each([
    [true, false, true],
    [true, true, true],
    [undefined, false, true],
    [false, true, true],
    [false, false, false],
  ])("rememberMe=%s, ブラウザ起動中の目印=%s → %s", (rememberMe, marker, expected) => {
    expect(isBrowserSessionAlive(rememberMe, marker)).toBe(expected);
  });
});

describe("authorized（ログイン保持なしは、ブラウザを閉じたらサーバー側でも未ログイン扱い）", () => {
  it("保持なし・目印なしで /login を開くと、ダッシュボードへ飛ばさずログイン画面を表示する", () => {
    expect(authorizedFor("/login", { rememberMe: false, cookie: false })).toBe(true);
  });
  it("保持なし・目印なしで保護ページを開くと、拒否する（ログイン画面へ誘導される）", () => {
    expect(authorizedFor("/books", { rememberMe: false, cookie: false })).toBe(false);
  });
  it("保持なし・目印ありは、ログイン済みとして扱う", () => {
    expect(authorizedFor("/books", { rememberMe: false, cookie: true })).toBe(true);
    expect(isRedirectTo(authorizedFor("/login", { rememberMe: false, cookie: true }), "/")).toBe(true);
  });
  it("保持あり・目印なしは、ログイン済みとして扱う", () => {
    expect(authorizedFor("/books", { rememberMe: true, cookie: false })).toBe(true);
    expect(isRedirectTo(authorizedFor("/login", { rememberMe: true, cookie: false }), "/")).toBe(true);
  });
  it("rememberMe が無い旧セッションは、保持ありとして扱う", () => {
    expect(authorizedFor("/books", { cookie: false })).toBe(true);
  });
  it("トークンなしは、未ログイン", () => {
    expect(authorizedFor("/books", null)).toBe(false);
    expect(authorizedFor("/login", null)).toBe(true);
  });
});
