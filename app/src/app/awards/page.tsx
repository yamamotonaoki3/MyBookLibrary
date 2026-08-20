import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { AwardTabs } from "./_components/AwardTabs";
import { YearFilter } from "./_components/YearFilter";
import { BookList } from "./_components/BookList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "賞別作品一覧 | MyBookLibrary",
};

// 賞タブの表示順（DBのid昇順=seed投入順とは独立に指定する）。
// ここに無い賞名は末尾に回すため、将来賞が追加されても表示から消えない。
const AWARD_DISPLAY_ORDER: Record<string, number> = {
  "直木賞": 0,
  "芥川賞": 1,
  "本屋大賞": 2,
  "このミステリーがすごい！": 3,
};

type PageProps = {
  searchParams: Promise<{
    awardId?: string;
    year?: string;
  }>;
};

export default async function AwardsPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = Number(session!.user.id);
  const { awardId: awardIdParam, year: yearParam } = await searchParams;

  const awards = await prisma.award.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  // タブの表示順のみ指定の並びに変更する。デフォルト選択（awardId未指定時）は
  // 従来通りDBのid昇順を基準にするため、選択ロジックには元の awards を使う。
  const sortedAwards = [...awards].sort(
    (a, b) => (AWARD_DISPLAY_ORDER[a.name] ?? Infinity) - (AWARD_DISPLAY_ORDER[b.name] ?? Infinity)
  );

  const showAll = awardIdParam === "all";
  const selectedAwardId: number | "all" = showAll
    ? "all"
    : awardIdParam
      ? parseInt(awardIdParam, 10)
      : (awards[0]?.id ?? 1);

  const selectedYear = yearParam ? parseInt(yearParam, 10) : undefined;

  const awardIdFilter = showAll ? {} : { awardId: selectedAwardId as number };

  const yearsData = await prisma.awardEntry.findMany({
    where: awardIdFilter,
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  const availableYears = yearsData.map((e) => e.year);

  const entryWhere = {
    ...awardIdFilter,
    ...(selectedYear !== undefined ? { year: selectedYear } : {}),
  };

  const bookIdsRaw = await prisma.awardEntry.findMany({
    where: entryWhere,
    select: { bookId: true },
    distinct: ["bookId"],
  });
  const uniqueBookIds = bookIdsRaw.map((e) => e.bookId);
  const totalEntries = uniqueBookIds.length;

  const readCount = await prisma.readingStatus.count({
    where: {
      userId: userId,
      status: "read",
      bookId: { in: uniqueBookIds },
    },
  });

  const pct = totalEntries > 0 ? Math.round((readCount / totalEntries) * 100) : 0;

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-5 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        賞別作品一覧
      </h1>
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl">

      {awards.length === 0 ? (
        <p className="text-zinc-500">賞データが登録されていません。</p>
      ) : (
        <>
          <AwardTabs awards={sortedAwards} selectedAwardId={selectedAwardId} />

          <div className="mt-4 mb-2 flex items-center justify-between gap-4">
            <YearFilter
              availableYears={availableYears}
              selectedYear={selectedYear}
            />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              進捗:{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                {readCount} / {totalEntries}冊
              </span>{" "}
              ({pct}%)
            </p>
          </div>

          <div className="mb-6">
            <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-2 rounded-full bg-zinc-900 transition-all dark:bg-zinc-50"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <Suspense
            key={`${selectedAwardId}-${selectedYear}`}
            fallback={
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
                  />
                ))}
              </div>
            }
          >
            <BookList awardId={selectedAwardId} year={selectedYear} />
          </Suspense>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
