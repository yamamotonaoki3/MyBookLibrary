/**
 * デモ環境専用の保護（docs/demo-environment.md、#721）。
 * 環境変数 DEMO_MODE が "true" のときだけ有効になる。本番・ステージング・ローカルでは設定しない（無効のまま、従来どおり動く）。
 * 値は、デモの Worker の vars（wrangler.jsonc の env.demo）だけに書く。
 */
import { NextResponse } from "next/server";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export const DEMO_FORBIDDEN_MESSAGE = "デモ環境では、この操作はできません。";

/** デモ環境で禁止する操作への、403 の応答。Route Handler の先頭で `if (isDemoMode()) return demoForbidden();` の形で使う。 */
export function demoForbidden(): NextResponse {
  return NextResponse.json({ error: DEMO_FORBIDDEN_MESSAGE, code: "DEMO_MODE" }, { status: 403 });
}
