import { prisma } from "@/lib/prisma";
import { flatMapInChunks } from "@/lib/chunk";

export async function getMutualFollowerIds(userId: number): Promise<number[]> {
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = following.map((f) => f.followingId);
  if (followingIds.length === 0) return [];

  // フォロー数に比例して `IN` の値が増え、D1 のバインドパラメータの上限（100 個）を超えるため、分割して検索する
  const mutual = await flatMapInChunks(followingIds, (part) =>
    prisma.follow.findMany({
      where: { followerId: { in: part }, followingId: userId },
      select: { followerId: true },
    })
  );
  return mutual.map((f) => f.followerId);
}
