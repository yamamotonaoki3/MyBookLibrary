jest.mock("next-auth", () => jest.fn(() => ({ auth: jest.fn() })));
jest.mock("../../../auth.config", () => ({ authConfig: {} }));

import { config } from "@/proxy";

/**
 * proxy の matcher は path-to-regexp 形式だが、括弧の中は正規表現として扱われる。
 * ここでは、先頭の `/(` ... `)` を含む全体を正規表現として評価して、どのパスが proxy を通るかを確認する。
 */
const matcher = new RegExp(`^${config.matcher[0]}$`);
const passesThroughProxy = (path: string) => matcher.test(path);

describe("proxy の matcher", () => {
  it.each(["/", "/books", "/books/1", "/login", "/admin/users", "/api/books", "/api/cron/check-new-books"])(
    "%s は proxy を通る（認証が必要な画面・API を守る）",
    (path) => {
      expect(passesThroughProxy(path)).toBe(true);
    }
  );

  it.each([
    "/api/auth/csrf",
    "/api/auth/session",
    "/api/auth/signin",
    "/api/auth/callback/credentials",
    "/api/auth/callback/google",
    "/api/auth/register",
  ])("%s（Auth.js・認証 API）は proxy を通さない", (path) => {
    expect(passesThroughProxy(path)).toBe(false);
  });

  it.each(["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico", "/icons/icon.png", "/x.ico"])(
    "%s（静的ファイル）は proxy を通さない",
    (path) => {
      expect(passesThroughProxy(path)).toBe(false);
    }
  );
});
