"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { UserItem } from "@/lib/followsListData";
import type { RecommendedUser } from "@/lib/userRecommendations";
import FollowButton from "@/app/_components/FollowButton";
import { FollowUserProfileModal } from "./FollowUserProfileModal";

type Tab = "following" | "followers" | "recommendations";

const TABS: { key: Tab; label: string }[] = [
  { key: "following", label: "フォロー" },
  { key: "followers", label: "フォロワー" },
  { key: "recommendations", label: "おすすめ" },
];

function UserList({
  users,
  emptyText,
  onFollowChange,
}: {
  users: UserItem[];
  emptyText: string;
  onFollowChange?: () => void;
}) {
  if (users.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {users.map((u) => (
        <li
          key={u.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <Link
            href={`/users/${u.id}`}
            className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-200"
          >
            {u.name}
          </Link>
          <FollowUserProfileModal targetUserId={u.id} targetUserName={u.name} />
          <span className="ml-auto">
            <FollowButton
              key={`${u.id}-${u.following}`}
              targetUserId={u.id}
              targetUserName={u.name}
              initialFollowing={u.following}
              onChanged={onFollowChange}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecommendationList({
  recommendations,
  onFollowChange,
}: {
  recommendations: RecommendedUser[];
  onFollowChange?: () => void;
}) {
  if (recommendations.length === 0) {
    return <p className="text-sm text-zinc-500">おすすめのユーザーはいません。</p>;
  }
  return (
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
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{namesLabel}</span>
            </div>
            <FollowUserProfileModal targetUserId={rec.userId} targetUserName={rec.name} />
            <span className="ml-auto">
              <FollowButton
                targetUserId={rec.userId}
                targetUserName={rec.name}
                initialFollowing={false}
                onChanged={onFollowChange}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Props = {
  following: UserItem[];
  followers: UserItem[];
  recommendations: RecommendedUser[];
  onFollowChange?: () => void;
  viewAllHref?: string;
};

export function FollowsTabs({ following, followers, recommendations, onFollowChange, viewAllHref }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("following");
  const idPrefix = useId();

  const counts: Record<Tab, number> = {
    following: following.length,
    followers: followers.length,
    recommendations: recommendations.length,
  };

  return (
    <div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="mb-3 flex items-center gap-0.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          一覧ページで見る
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}

      <div role="tablist" className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${key}`}
            aria-controls={`${idPrefix}-tabpanel-${key}`}
            aria-selected={activeTab === key}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
            className={`min-w-0 flex-1 truncate border-b-2 px-1 py-2 text-xs font-medium transition-colors sm:text-sm ${
              activeTab === key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}（{counts[key]}）
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${idPrefix}-tabpanel-following`}
        aria-labelledby={`${idPrefix}-tab-following`}
        hidden={activeTab !== "following"}
      >
        <UserList
          users={following}
          emptyText="フォロー中のユーザーはいません。"
          onFollowChange={onFollowChange}
        />
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-tabpanel-followers`}
        aria-labelledby={`${idPrefix}-tab-followers`}
        hidden={activeTab !== "followers"}
      >
        <UserList
          users={followers}
          emptyText="フォロワーはまだいません。"
          onFollowChange={onFollowChange}
        />
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-tabpanel-recommendations`}
        aria-labelledby={`${idPrefix}-tab-recommendations`}
        hidden={activeTab !== "recommendations"}
      >
        <RecommendationList
          recommendations={recommendations}
          onFollowChange={onFollowChange}
        />
      </div>
    </div>
  );
}
