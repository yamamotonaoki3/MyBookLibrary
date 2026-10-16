/**
 * セッション（JWT）の有効期間の方針。
 *
 * 通常（本番・ステージング・ローカル）は、Auth.js の既定のまま（変えない）。
 * デモ環境（DEMO_MODE=true、#736）だけ、短くする。誰かがログインしたまま放置しても、次にデモの URL を開いた人が、
 * その人の続きの画面にならず、ログイン画面に戻るようにするため。
 *
 * JWT のセッションは、画面を操作してセッションを取得するたびに、有効期限が延びる（放置から maxAge 後に切れる）。
 */
import { isDemoMode } from "@/lib/demoMode";

/** デモ環境のセッションの有効期間（秒）。放置から 15 分で、ログイン画面に戻る。 */
export const DEMO_SESSION_MAX_AGE_SECONDS = 15 * 60;

/** `session` の設定に展開して使う。デモ環境以外では空（Auth.js の既定の期間のまま）。 */
export function sessionMaxAgeOption(): { maxAge?: number } {
  return isDemoMode() ? { maxAge: DEMO_SESSION_MAX_AGE_SECONDS } : {};
}
