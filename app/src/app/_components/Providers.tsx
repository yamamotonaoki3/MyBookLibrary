"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const CHANGE_PASSWORD_PATH = "/settings/change-password";
const LOGIN_PATH = "/login";

// 管理者による強制パスワードリセット後、一時パスワードのままアプリを
// 使い続けられないよう、mustChangePasswordが立っている間は
// パスワード変更画面へ強制的にリダイレクトする
function ForceChangePasswordGuard() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.mustChangePassword) return;
    if (pathname === CHANGE_PASSWORD_PATH) return;
    // ログイン画面で認証済みなのは、ブラウザを閉じたあとの古いトークン（proxy は未ログインとして扱う。#782）。
    // 変更画面へ移すと、proxy にログイン画面へ戻されて循環し、ログインできなくなる
    if (pathname.startsWith(LOGIN_PATH)) return;
    router.replace(CHANGE_PASSWORD_PATH);
  }, [status, session?.user?.mustChangePassword, pathname, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ForceChangePasswordGuard />
      {children}
    </SessionProvider>
  );
}
