"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useEffect } from "react";

function RememberMeGuard() {
  const { status } = useSession();

  // ページロード時に oauthSessionActive を処理・必ずクリア
  // sessionStorage の有無に関わらずクリアすることでブラウザ再起動後に残り続けるバグを防ぐ
  useEffect(() => {
    const oauthTime = localStorage.getItem("oauthSessionActive");
    if (oauthTime) {
      const isRecent = Date.now() - Number(oauthTime) < 2 * 60 * 1000;
      if (isRecent && !sessionStorage.getItem("sessionActive")) {
        sessionStorage.setItem("sessionActive", "1");
      }
      localStorage.removeItem("oauthSessionActive");
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const rememberMe = localStorage.getItem("rememberMe");
    if (rememberMe === null) {
      localStorage.setItem("rememberMe", "1");
      return;
    }
    if (rememberMe === "0" && !sessionStorage.getItem("sessionActive")) {
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
