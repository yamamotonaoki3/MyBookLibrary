"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

export function Header() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "ゲスト";
  const initial = userName.charAt(0).toUpperCase();

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUnreadCount(data.filter((n: { isRead: boolean }) => !n.isRead).length);
        }
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="lg:hidden fixed left-0 right-0 top-0 z-50 flex h-14 shrink-0 items-center border-b border-emerald-800 bg-emerald-700 px-4">
      <Link href="/" className="text-sm font-bold text-white">
        MyBookLibrary
      </Link>

      <div className="flex flex-1 items-center justify-end gap-3">
        {/* 通知ベル */}
        <Link
          href="/notifications"
          className="relative flex items-center text-white/70 hover:text-white"
          aria-label="通知"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </Link>

        {/* ユーザーアバター＋名前＋ログアウト */}
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
              {initial}
            </div>
            <span className="text-xs font-medium text-white leading-none">{userName}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white transition-colors"
          >
            <LogOut className="h-3 w-3" />
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
