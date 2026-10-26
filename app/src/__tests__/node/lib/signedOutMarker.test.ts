import { clearSignedOutMarkerOnLogin } from "@/lib/signedOutMarker";
import { SIGNED_OUT_COOKIE } from "@/lib/sessionMarkers";

function responseWithCookies(...cookies: string[]): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 200, headers });
}

function markerCleared(response: Response): boolean {
  return response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SIGNED_OUT_COOKIE}=;`) && /Max-Age=0/i.test(cookie));
}

const callback = (host = "https://example.com") => new Request(`${host}/api/auth/callback/credentials`, { method: "POST" });

describe("clearSignedOutMarkerOnLogin（ログイン成功のときだけ、ログアウト済みの目印を消す。#784）", () => {
  it("ログイン成功（新しいセッション Cookie が発行される）では、目印を消す", () => {
    const result = clearSignedOutMarkerOnLogin(callback(), responseWithCookies("__Secure-authjs.session-token=abc; Path=/; HttpOnly"));
    expect(markerCleared(result)).toBe(true);
  });

  it("ログイン失敗（セッション Cookie が発行されない）では、目印を残す", () => {
    expect(markerCleared(clearSignedOutMarkerOnLogin(callback(), responseWithCookies("authjs.callback-url=x; Path=/")))).toBe(false);
  });

  it("セッション Cookie の削除（サインアウト）では、目印を残す", () => {
    expect(markerCleared(clearSignedOutMarkerOnLogin(callback(), responseWithCookies("authjs.session-token=; Max-Age=0; Path=/")))).toBe(false);
  });

  it("ログインのコールバック以外（セッション取得による Cookie の再発行）では、目印を残す", () => {
    const session = new Request("https://example.com/api/auth/session");
    expect(markerCleared(clearSignedOutMarkerOnLogin(session, responseWithCookies("authjs.session-token=abc; Path=/")))).toBe(false);
  });

  it("https では Secure を付けて消す（Secure の Cookie は、Secure なしでは上書きできないため）", () => {
    const result = clearSignedOutMarkerOnLogin(callback("https://example.com"), responseWithCookies("authjs.session-token=abc; Path=/"));
    expect(result.headers.getSetCookie().find((c) => c.startsWith(`${SIGNED_OUT_COOKIE}=`))).toMatch(/; Secure/);
    const http = clearSignedOutMarkerOnLogin(callback("http://localhost:3000"), responseWithCookies("authjs.session-token=abc; Path=/"));
    expect(http.headers.getSetCookie().find((c) => c.startsWith(`${SIGNED_OUT_COOKIE}=`))).not.toMatch(/Secure/);
  });

  it("元の Cookie と本文を保つ", () => {
    const original = new Response("body", { status: 302, headers: { location: "/" } });
    original.headers.append("set-cookie", "authjs.session-token=abc; Path=/");
    const result = clearSignedOutMarkerOnLogin(callback(), original);
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("/");
    expect(result.headers.getSetCookie()).toContain("authjs.session-token=abc; Path=/");
  });
});
