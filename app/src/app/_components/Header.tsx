"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

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
    <header className="lg:hidden fixed left-0 right-0 top-0 z-50 flex h-10 shrink-0 items-center border-b border-emerald-800 bg-emerald-700 px-4">
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

        {/* ユーザーアバター＋名前 */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
            T
          </div>
          <span className="text-sm font-medium text-white">テストユーザー</span>
        </div>
      </div>
    </header>
  );
}
