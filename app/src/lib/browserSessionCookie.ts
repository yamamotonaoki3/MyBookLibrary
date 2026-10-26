import { BROWSER_SESSION_COOKIE } from "@/lib/sessionPolicy";

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
