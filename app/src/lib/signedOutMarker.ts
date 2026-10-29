import { SIGNED_OUT_COOKIE } from "@/lib/sessionMarkers";

/** proxyを通らないセッション取得でも、ログアウト済みの目印を尊重する。 */
export function sessionRequestIsSignedOut(method: string, pathname: string, cookieHeader: string | null): boolean {
  if (method !== "GET" || pathname !== "/api/auth/session") return false;
  return (cookieHeader ?? "").split(";").some((cookie) => {
    const equals = cookie.indexOf("=");
    return equals >= 0 && cookie.slice(0, equals).trim() === SIGNED_OUT_COOKIE;
  });
}

/**
 * ログイン成功のとき（ログインのコールバックの応答が、新しいセッション Cookie を発行するとき）だけ、ログアウト済みの目印を消す（#784）。
 * ブラウザ側で、ログインの送信前に消すと、ログインの失敗やキャンセルのあとに、書き戻された古いセッションを拒否する目印がなくなる。
 * セッション取得による Cookie の再発行（`/api/auth/session`）と、サインアウトによる削除では、消さない。
 */
export function clearSignedOutMarkerOnLogin(request: Request, response: Response): Response {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/callback/")) return response;

  const issuesNewSession = response.headers
    .getSetCookie()
    .some((cookie) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=[^;]+/.test(cookie));
  if (!issuesNewSession) return response;

  // Secure の Cookie は、Secure なしでは上書き・削除できないため、https では Secure を付ける
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const next = new Response(response.body, response);
  next.headers.append("set-cookie", `${SIGNED_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  return next;
}
