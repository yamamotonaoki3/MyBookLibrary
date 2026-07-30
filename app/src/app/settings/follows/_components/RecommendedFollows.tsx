"use client";

import Link from "next/link";
import type { RecommendedUser } from "@/lib/userRecommendations";
import FollowButton from "@/app/_components/FollowButton";

type Props = {
  recommendations: RecommendedUser[];
};

export function RecommendedFollows({ recommendations }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        おすすめユーザー
      </h2>
      <ul className="flex flex-col gap-2">
        {recommendations.map((rec) => {
          const remaining = rec.commonAuthorCount - rec.commonAuthorNames.length;
          const namesLabel =
            remaining > 0
              ? `${rec.commonAuthorNames.join("、")} 他${remaining}件`
              : rec.commonAuthorNames.join("、");
          return (
            <li
              key={rec.userId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/users/${rec.userId}`}
                  className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-200"
                >
                  {rec.name}
                </Link>
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {namesLabel}
                </span>
              </div>
              <span className="ml-auto">
                <FollowButton
                  targetUserId={rec.userId}
                  targetUserName={rec.name}
                  initialFollowing={false}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
