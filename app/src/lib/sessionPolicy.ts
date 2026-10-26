/**
 * セッション（JWT）の有効期間の方針。
 *
 * 通常（本番・ステージング・ローカル）は、Auth.js の既定のまま（変えない）。
 * デモ環境（DEMO_MODE=true、#736）だけ、短くする。誰かがログインしたまま放置しても、次にデモの URL を開いた人が、
 * その人の続きの画面にならず、ログイン画面に戻るようにするため。
 *
 * JWT のセッションは、画面を操作してセッションを取得するたびに、有効期限が延びる（放置から maxAge 後に切れる）。
 *
 * ログイン保持（rememberMe）なしでログインした場合は、サーバー側でも 8 時間で切る（#737）。
 * 保持ありは、既定のまま（30 日。デモ環境は 15 分）。
 */
import { isDemoMode } from "@/lib/demoMode";

// 目印の Cookie の定数は、ブラウザ側からも使うため、依存のないモジュールに置く（next/server をクライアントに入れない）。
export { BROWSER_SESSION_COOKIE, SIGNED_OUT_COOKIE, SIGNED_OUT_MARKER_SECONDS } from "@/lib/sessionMarkers";

/** デモ環境のセッションの有効期間（秒）。放置から 15 分で、ログイン画面に戻る。 */
export const DEMO_SESSION_MAX_AGE_SECONDS = 15 * 60;

/** `session` の設定に展開して使う。デモ環境以外では空（Auth.js の既定の期間のまま）。 */
export function sessionMaxAgeOption(): { maxAge?: number } {
  return isDemoMode() ? { maxAge: DEMO_SESSION_MAX_AGE_SECONDS } : {};
}

/** ログイン保持なしのセッションの有効期間（秒）。放置から 8 時間。 */
export const NO_REMEMBER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Auth.js の既定の有効期間（30 日）。`jwt.maxAge` が渡されなかったときの値。 */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * トークンの有効期間（秒）。ログイン保持なし（`token.rememberMe === false`）なら 8 時間、
 * それ以外（保持あり、旧トークン、Google ログイン）は `defaultMaxAge`。`defaultMaxAge` が 8 時間より短ければ、そちらを使う。
 */
export function sessionMaxAgeFor(token: object | null | undefined, defaultMaxAge: number = DEFAULT_SESSION_MAX_AGE_SECONDS): number {
  return (token as { rememberMe?: unknown } | null | undefined)?.rememberMe === false ? Math.min(defaultMaxAge, NO_REMEMBER_SESSION_MAX_AGE_SECONDS) : defaultMaxAge;
}

/**
 * セッションを有効として扱うか。ログイン保持なし（`rememberMe === false`）のときだけ、ブラウザ起動中の目印が必要。
 * 保持あり、旧トークン（`rememberMe` なし）、Google ログインは、目印を見ない。
 */
export function isBrowserSessionAlive(rememberMe: boolean | undefined, hasBrowserSessionMarker: boolean): boolean {
  return rememberMe !== false || hasBrowserSessionMarker;
}
