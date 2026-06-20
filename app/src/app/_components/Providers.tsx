"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useEffect } from "react";

function RememberMeGuard() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const rememberMe = localStorage.getItem("rememberMe");
    if (rememberMe === null) {
      // Google OAuth 等でフラグ未設定の場合は保持扱いにする
      localStorage.setItem("rememberMe", "1");
      return;
    }
    if (rememberMe === "0") {
      const hasSession = sessionStorage.getItem("sessionActive");
      if (!hasSession) {
        // OAuth リダイレクト後のグレース期間チェック（5分以内なら sessionStorage を復元）
        const oauthTime = localStorage.getItem("oauthSessionActive");
        const isOAuthGrace = oauthTime && Date.now() - Number(oauthTime) < 5 * 60 * 1000;
        if (isOAuthGrace) {
          sessionStorage.setItem("sessionActive", "1");
          localStorage.removeItem("oauthSessionActive");
          return;
        }
        signOut({ callbackUrl: "/login" });
      }
    }
  }, [status]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RememberMeGuard />
      {children}
    </SessionProvider>
  );
}
