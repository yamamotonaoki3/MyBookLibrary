import { prisma } from "@/lib/prisma";

export type UserItem = {
  id: number;
  name: string;
  isMutual: boolean;
  following: boolean;
};

export async function getFollowsListData(
  userId: number
): Promise<{ following: UserItem[]; followers: UserItem[] }> {
  const [followingRows, followerRows] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      select: { follower: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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

  return { following, followers };
}
