import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getRecommendedUsers } from "@/lib/userRecommendations";
import { getFollowsListData } from "@/lib/followsListData";
import { FollowsTabs } from "../_components/FollowsTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "フォロー管理 | MyBookLibrary",
};

export default async function FollowsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const myUserId = Number(session.user.id);

  const [{ following, followers }, recommendations] = await Promise.all([
    getFollowsListData(myUserId),
    getRecommendedUsers(myUserId),
  ]);

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-6 shrink-0 text-2xl font-bold tracking-tight lg:text-3xl">
        フォロー管理
      </h1>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg">
          <FollowsTabs following={following} followers={followers} recommendations={recommendations} />
        </div>
      </div>
    </div>
  );
}
