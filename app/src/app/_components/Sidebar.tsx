"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BookOpen,
  Trophy,
  Search,
  Heart,
  MessageSquare,
  Bell,
  Library,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Settings,
  UserCog,
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: session, status } = useSession();
  const userName = status === "loading" ? "" : (session?.user?.name ?? "ゲスト");
  const userEmail = status === "loading" ? "" : (session?.user?.email ?? "");
  const isAdmin = session?.user?.role === "admin";
  const initial = userName.charAt(0).toUpperCase();

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) {
      startTransition(() => setIsCollapsed(saved === "true"));
    }
  }, []);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

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
    <aside
      className={`hidden lg:flex shrink-0 flex-col bg-emerald-700 min-h-screen transition-all duration-300 ${
        isCollapsed ? "w-14" : "w-52"
      }`}
    >
      {/* ロゴ + 折りたたみボタン */}
      <div className={`flex items-center py-7 ${isCollapsed ? "justify-center px-0" : "justify-between px-6"}`}>
        {!isCollapsed && (
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
              <Library className="h-5 w-5 text-white" />
            </div>
            <span className="text-base font-semibold text-white">MyBookLibrary</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
            <Library className="h-5 w-5 text-white" />
          </Link>
        )}
        {!isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="サイドバーを閉じる"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 折りたたみ時の開くボタン */}
      {isCollapsed && (
        <div className="flex justify-center px-0 pb-2">
          <button
            onClick={toggleCollapsed}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="サイドバーを開く"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ナビゲーション */}
      <nav className={`flex flex-1 flex-col gap-7 ${isCollapsed ? "px-1" : "px-4"}`}>
        {/* CURRENT セクション */}
        <div>
          {!isCollapsed && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
              ライブラリ
            </p>
          )}
          <div className="flex flex-col gap-1">
            {MAIN_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  title={isCollapsed ? label : undefined}
                  className={`flex items-center rounded-lg transition-colors ${
                    isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                  } text-base font-medium ${
                    isActive
                      ? "bg-violet-600 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ACCOUNT セクション */}
        <div>
          {!isCollapsed && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
              メニュー
            </p>
          )}
          <div className="flex flex-col gap-1">
            {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  title={isCollapsed ? label : undefined}
                  className={`flex items-center rounded-lg transition-colors ${
                    isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                  } text-base font-medium ${
                    isActive
                      ? "bg-violet-600 text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && label}
                </Link>
              );
            })}

            {/* 通知 */}
            <Link
              href="/notifications"
              title={isCollapsed ? "通知" : undefined}
              className={`flex items-center rounded-lg transition-colors ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
              } text-base font-medium ${
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
              {!isCollapsed && "通知"}
            </Link>
          </div>
        </div>

        {/* 設定セクション（一般ユーザー）*/}
        {!isAdmin && (
          <div>
            {!isCollapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
                設定
              </p>
            )}
            <div className="flex flex-col gap-1">
              <Link
                href="/settings"
                title={isCollapsed ? "設定" : undefined}
                className={`flex items-center rounded-lg transition-colors ${
                  isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                } text-base font-medium ${
                  pathname === "/settings"
                    ? "bg-violet-600 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <UserCog className="h-5 w-5 shrink-0" />
                {!isCollapsed && "設定"}
              </Link>
            </div>
          </div>
        )}

        {/* ADMIN セクション */}
        {isAdmin && (
          <div>
            {!isCollapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-white/50">
                管理
              </p>
            )}
            <div className="flex flex-col gap-1">
              <Link
                href="/admin"
                title={isCollapsed ? "管理画面" : undefined}
                className={`flex items-center rounded-lg transition-colors ${
                  isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                } text-base font-medium ${
                  pathname === "/admin" || pathname.startsWith("/admin/")
                    ? "bg-violet-600 text-white"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Settings className="h-5 w-5 shrink-0" />
                {!isCollapsed && "管理画面"}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ユーザー欄 */}
      <div className="border-t border-white/10 px-2 py-3">
        <div
          className={`flex items-center rounded-lg transition-colors ${
            isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-3"
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
            {initial}
          </div>
          {!isCollapsed && (
            <div className="flex flex-1 flex-col min-w-0">
              <span className="text-sm font-medium text-white leading-none">{userName}</span>
              <span className="text-xs text-white/50 leading-none mt-1 truncate">{userEmail}</span>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            ログアウト
          </button>
        )}
        {isCollapsed && (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-1 flex w-full items-center justify-center rounded-lg py-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            title="ログアウト"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
