"use client";

import { signOut } from "next-auth/react";

// 管理者権限を剥奪された直後、admin APIは403を返す（Issue #417）。
// その403を検知してログイン画面へ誘導し、生のJSONエラーが画面に
// 表示されたままになるのを防ぐ（Issue #421）。
export async function adminFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 403) {
    await signOut({ callbackUrl: "/login?error=ADMIN_FORBIDDEN" });
  }
  return res;
}
