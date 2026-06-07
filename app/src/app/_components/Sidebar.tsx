"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Trophy,
  Search,
  Heart,
  MessageSquare,
  Bell,
  Library,
  ChevronRight,
} from "lucide-react";

const MAIN_LINKS = [
  { href: "/books", label: "私の本一覧", icon: BookOpen },
  { href: "/awards", label: "賞別一覧", icon: Trophy },
  { href: "/my-reviews", label: "投稿した感想", icon: MessageSquare },
];

const ACCOUNT_LINKS = [
  { href: "/favorite-authors", label: "お気に入り著者", icon: Heart },
  { href: "/books/search", label: "本を探す", icon: Search },
];

export function Sidebar() {
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
    <aside className="hidden md:flex w-52 shrink-0 flex-col bg-emerald-700 min-h-screen">
      {/* アプリ名 */}
      <div className="px-6 py-7">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
            <Library className="h-5 w-5 text-white" />
          </div>
          <span className="text-base font-semibold text-white">MyBookLibrary</span>
        </Link>
      </div>

      {/* ナビゲーション */}
      <nav className="flex flex-1 flex-col gap-7 px-4">
        {/* CURRENT セクション */}
        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
            Current
          </p>
          <div className="flex flex-col gap-1">
            {MAIN_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                    isActive
                      ? "bg-violet-600 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ACCOUNT セクション */}
        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
            Account
          </p>
          <div className="flex flex-col gap-1">
            {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                    isActive
                      ? "bg-violet-600 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}

            {/* 通知 */}
            <Link
              href="/notifications"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                pathname === "/notifications"
                  ? "bg-violet-600 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="relative">
                <Bell className="h-5 w-5 shrink-0" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              通知
            </Link>
          </div>
        </div>
      </nav>

      {/* ユーザー欄 */}
      <div className="border-t border-white/10 px-4 py-5">
        <div className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/10 cursor-pointer transition-colors">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
            T
          </div>
          <div className="flex flex-1 flex-col min-w-0">
            <span className="text-sm font-medium text-white leading-none">テストユーザー</span>
            <span className="text-xs text-white/50 leading-none mt-1 truncate">test@example.com</span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
        </div>
      </div>
    </aside>
  );
}
