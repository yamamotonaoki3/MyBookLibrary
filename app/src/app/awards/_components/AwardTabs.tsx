"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { AwardItem } from "@/types/award";

type Props = {
  awards: AwardItem[];
  selectedAwardId: number;
};

export function AwardTabs({ awards, selectedAwardId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSelect(awardId: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("awardId", String(awardId));
    params.delete("year");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700">
      {awards.map((award) => (
        <button
          key={award.id}
          onClick={() => handleSelect(award.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            award.id === selectedAwardId
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          {award.name}
        </button>
      ))}
    </nav>
  );
}
