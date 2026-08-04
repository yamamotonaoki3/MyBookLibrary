"use client";

// 管理者権限を剥奪された直後、admin APIは403を返す（Issue #417）。
// その403を検知して生のJSONエラーが画面に表示されたままになるのを防ぎ、
// セッションは維持したまま一般ユーザー向けのダッシュボードへ誘導する（Issue #423）。
export async function adminFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 403) {
    window.location.href = "/";
  }
  return res;
}
