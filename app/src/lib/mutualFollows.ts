import { prisma } from "@/lib/prisma";

export async function getMutualFollowerIds(userId: number): Promise<number[]> {
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = following.map((f) => f.followingId);
  if (followingIds.length === 0) return [];

  const mutual = await prisma.follow.findMany({
    where: { followerId: { in: followingIds }, followingId: userId },
    select: { followerId: true },
  });
  return mutual.map((f) => f.followerId);
}
