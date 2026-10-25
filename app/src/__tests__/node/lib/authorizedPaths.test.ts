jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));

import { authConfig } from "@/auth.config";

function authorizedFor(pathname: string, loggedIn: boolean) {
  const authorized = authConfig.callbacks?.authorized as (args: unknown) => unknown;
  return authorized({
    auth: loggedIn ? { user: { email: "user@example.com", role: "user" } } : null,
    request: { nextUrl: new URL(`https://example.com${pathname}`) },
  });
}

describe("authorized（公開パス）", () => {
  it.each(["/sw.js", "/workbox-1234abcd.js", "/pwa-worker-1234abcd.js"])("PWAの公開スクリプト %s を認証前に取得できる", (pathname) => {
    expect(authorizedFor(pathname, false)).toBe(true);
  });
  it.each(["/api/sw.js", "/sw.js/private", "/workbox-private.js", "/pwa-worker-private.js", "/workbox-1234abcd.js/private"])("類似した保護パス %s は公開しない", (pathname) => {
    expect(authorizedFor(pathname, false)).toBe(false);
  });
  it("/api/version は、ログインなしでも取得できる", () => {
    expect(authorizedFor("/api/version", false)).toBe(true);
  });

  it("/api/version 以外の API と、画面は、ログインなしでは拒否する", () => {
    expect(authorizedFor("/api/versions", false)).toBe(false);
    expect(authorizedFor("/api/books/search", false)).toBe(false);
    expect(authorizedFor("/books", false)).toBe(false);
  });
});
