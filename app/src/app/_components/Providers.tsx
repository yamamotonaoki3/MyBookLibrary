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
    const hasSessionActive = document.cookie
      .split(";")
      .some((c) => c.trim().startsWith("session-active="));
    if (rememberMe === "0" && !hasSessionActive) {
      signOut({ callbackUrl: "/login" });
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
