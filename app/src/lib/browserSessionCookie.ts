import { signOut } from "next-auth/react";
import { BROWSER_SESSION_COOKIE, SIGNED_OUT_COOKIE, SIGNED_OUT_MARKER_SECONDS } from "@/lib/sessionMarkers";

/**
 * ログイン保持なしでログインしたあと、ブラウザ起動中の目印の Cookie を発行する（#782）。
 * 有効期限（Expires / Max-Age）を付けないので、ブラウザを閉じると消える。
 */
export function markBrowserSessionAlive(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${BROWSER_SESSION_COOKIE}=1; Path=/; SameSite=Lax${secure}`;
}

/** ログイン保持ありでログインしたときに、前回の目印を片付ける。 */
export function clearBrowserSessionMarker(): void {
  document.cookie = `${BROWSER_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function cookieAttributes(): string {
  return `Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

/** ログアウト済みの目印を発行する（#784）。短い期間だけ有効。 */
export function markSignedOut(): void {
  document.cookie = `${SIGNED_OUT_COOKIE}=1; Max-Age=${SIGNED_OUT_MARKER_SECONDS}; ${cookieAttributes()}`;
}

/**
 * ログアウトする。サインアウトの前に目印を発行し、飛行中のセッション応答が Cookie を書き戻しても、
 * サーバーが未ログイン扱いにするようにする（#784）。画面のログアウトは、すべてこの関数を使う。
 */
export async function signOutWithMarker(): Promise<void> {
  markSignedOut();
  await signOut({ callbackUrl: "/login" });
}
