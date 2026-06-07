"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { AwardItem } from "@/types/award";

type Props = {
  awards: AwardItem[];
  selectedAwardId: number | "all";
};

export function AwardTabs({ awards, selectedAwardId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSelect(awardId: number | "all") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("awardId", String(awardId));
    params.delete("year");
    router.push(`${pathname}?${params.toString()}`);
  }

  const btnBase = "rounded-full px-4 py-1.5 text-sm font-medium transition-colors";
  const btnActive = "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900";
  const btnInactive = "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700";

  return (
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700">
      <button
        onClick={() => handleSelect("all")}
        className={`${btnBase} ${selectedAwardId === "all" ? btnActive : btnInactive}`}
      >
        すべての受賞作
      </button>
      {awards.map((award) => (
        <button
          key={award.id}
          onClick={() => handleSelect(award.id)}
          className={`${btnBase} ${award.id === selectedAwardId ? btnActive : btnInactive}`}
        >
          {award.name}
        </button>
      ))}
    </nav>
  );
}
