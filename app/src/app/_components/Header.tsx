"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/books", label: "本一覧" },
  { href: "/awards", label: "賞別一覧" },
  { href: "/books/search", label: "本を探す" },
  { href: "/favorite-authors", label: "お気に入り著者" },
  { href: "/my-reviews", label: "投稿した感想" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
        <Link
          href="/"
          className="text-lg font-bold text-zinc-900 dark:text-zinc-50"
        >
          MyBookLibrary
        </Link>

        <nav className="flex gap-4">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
