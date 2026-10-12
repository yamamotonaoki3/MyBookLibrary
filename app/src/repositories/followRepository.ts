import { prisma } from "@/lib/prisma";
import { atomically, type AtomicStep } from "@/lib/atomically";

const MUTUAL_NOTIFICATION_TYPES = ["mutual_favorite_author", "mutual_want_to_read"];

/**
 * フォローを解除する。相互フォローだった場合は、2 人の間の相互通知（お気に入り著者・読みたい本の一致）も
 * 同時に削除する。どちらかが失敗したら両方とも取り消される（原子的）。
 */
export async function removeFollow(params: {
  followId: number;
  userId: number;
  targetUserId: number;
  /** 相手からもフォローされていた（相互フォローだった）か。 */
  wasMutual: boolean;
}): Promise<void> {
  const { followId, userId, targetUserId, wasMutual } = params;

  const steps: AtomicStep[] = [
    {
      prisma: () => prisma.follow.delete({ where: { id: followId } }),
      d1: { sql: "DELETE FROM follows WHERE id = ?", params: [followId] },
      requireRow: true,
    },
  ];

  if (wasMutual) {
    steps.push({
      prisma: () =>
        prisma.notification.deleteMany({
          where: {
            type: { in: MUTUAL_NOTIFICATION_TYPES },
            OR: [
              { userId, actorId: targetUserId },
              { userId: targetUserId, actorId: userId },
            ],
          },
        }),
      d1: {
        sql: `DELETE FROM notifications
              WHERE type IN (${MUTUAL_NOTIFICATION_TYPES.map(() => "?").join(", ")})
                AND ((user_id = ? AND actor_id = ?) OR (user_id = ? AND actor_id = ?))`,
        params: [...MUTUAL_NOTIFICATION_TYPES, userId, targetUserId, targetUserId, userId],
      },
    });
  }

  await atomically(steps);
}
