"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Trophy, Search, Heart, MessageSquare } from "lucide-react";

const TAB_LINKS = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/books", label: "本一覧", icon: BookOpen },
  { href: "/awards", label: "賞別", icon: Trophy },
  { href: "/books/search", label: "探す", icon: Search },
  { href: "/favorite-authors", label: "著者", icon: Heart },
  { href: "/my-reviews", label: "感想", icon: MessageSquare },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/8 bg-emerald-700 lg:hidden">
      {TAB_LINKS.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === "/" || href === "/books"
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
              isActive ? "text-white" : "text-white/50"
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-white/50"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
