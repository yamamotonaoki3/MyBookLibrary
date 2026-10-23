import type { Page } from "@playwright/test";
import { decode } from "next-auth/jwt";

/** ログインで発行された実JWTの期限だけを返す。トークン・秘密鍵は出力しない。 */
export async function sessionLifetimeSeconds(page: Page): Promise<number> {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((item) => /^(?:__Secure-)?authjs\.session-token$/.test(item.name));
  const secret = process.env.AUTH_SECRET;
  if (!cookie || !secret) throw new Error("テスト用セッションCookieまたは秘密鍵がありません");
  const token = await decode({ token: cookie.value, secret, salt: cookie.name });
  if (typeof token?.exp !== "number" || typeof token?.iat !== "number") {
    throw new Error("セッションJWTに有効期限がありません");
  }
  return token.exp - token.iat;
}
