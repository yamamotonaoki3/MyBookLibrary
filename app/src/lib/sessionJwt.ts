/**
 * セッションの JWT を発行する関数（#737）。Auth.js の既定の発行に、ログイン保持（rememberMe）ごとの有効期間を足す。
 *
 * Auth.js は、トークンを発行するたび（ログイン時と、セッションを取得して期限を延ばすとき）に、
 * 有効期限を「いま + maxAge」で上書きする。トークンごとに期間を変えるため、発行の関数で maxAge を決める。
 * proxy（auth.config.ts）と認証本体（auth.ts）のどちらが期限を延ばしても、同じ期間になるよう、共通の設定から使う。
 */
import type { JWTEncodeParams } from "next-auth/jwt";
import { sessionMaxAgeFor } from "@/lib/sessionPolicy";

export async function encodeSessionToken(params: JWTEncodeParams): Promise<string> {
  // next-auth/jwt は ESM のため、発行のときに読み込む（auth.config.ts を読み込むだけの Jest のテストを壊さないため）
  const { encode } = await import("next-auth/jwt");
  return encode({ ...params, maxAge: sessionMaxAgeFor(params.token, params.maxAge) });
}
