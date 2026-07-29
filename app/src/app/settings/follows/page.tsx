import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import FollowButton from "@/app/_components/FollowButton";
import { getRecommendedUsers } from "@/lib/userRecommendations";
import { RecommendedFollows } from "./_components/RecommendedFollows";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "フォロー管理 | MyBookLibrary",
};

type UserItem = {
  id: number;
  name: string;
  isMutual: boolean;
  following: boolean;
};

function UserList({ users, emptyText }: { users: UserItem[]; emptyText: string }) {
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
          {u.isMutual && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              相互フォロー
            </span>
          )}
          <span className="ml-auto">
            {/* 同一ユーザーのボタンが複数箇所にあるため、refresh 後に最新のフォロー状態で再マウントさせる */}
            <FollowButton
              key={`${u.id}-${u.following}`}
              targetUserId={u.id}
              targetUserName={u.name}
              initialFollowing={u.following}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function FollowsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const myUserId = Number(session.user.id);

  const [followingRows, followerRows] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: myUserId },
      select: { following: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.follow.findMany({
      where: { followingId: myUserId },
      select: { follower: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const recommendations = await getRecommendedUsers(myUserId);

  const followingIds = new Set(followingRows.map((r) => r.following.id));
  const followerIds = new Set(followerRows.map((r) => r.follower.id));

  const following: UserItem[] = followingRows.map((r) => ({
    id: r.following.id,
    name: r.following.name,
    isMutual: followerIds.has(r.following.id),
    following: true,
  }));
  const followers: UserItem[] = followerRows.map((r) => ({
    id: r.follower.id,
    name: r.follower.name,
    isMutual: followingIds.has(r.follower.id),
    following: followingIds.has(r.follower.id),
  }));

  return (
    <div className="flex flex-col px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight lg:text-3xl">
        フォロー管理
      </h1>

      <div className="flex max-w-lg flex-col gap-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            フォロー中（{following.length}）
          </h2>
          <UserList
            users={following}
            emptyText="フォロー中のユーザーはいません。"
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            フォロワー（{followers.length}）
          </h2>
          <UserList
            users={followers}
            emptyText="フォロワーはまだいません。"
          />
        </section>

        <RecommendedFollows recommendations={recommendations} />
      </div>
    </div>
  );
}
