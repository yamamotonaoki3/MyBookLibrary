"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Props = {
  availableYears: number[];
  selectedYear: number | undefined;
};

export function YearFilter({ availableYears, selectedYear }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("year", e.target.value);
    } else {
      params.delete("year");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="year-filter"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        年度：
      </label>
      <select
        id="year-filter"
        value={selectedYear ?? ""}
        onChange={handleYearChange}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        <option value="">すべて</option>
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}年
          </option>
        ))}
      </select>
    </div>
  );
}
