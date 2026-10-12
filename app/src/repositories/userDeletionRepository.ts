import { prisma } from "@/lib/prisma";
import { atomically } from "@/lib/atomically";

const MUTUAL_NOTIFICATION_TYPES = ["mutual_favorite_author", "mutual_want_to_read"];

/**
 * 一般ユーザー（role = "user"）と、そのユーザーに紐づくデータを削除する。管理者は削除しない。
 *
 * 事前の role チェックと削除の間に、別リクエストが対象を管理者へ昇格させる競合に備え、
 * すべての削除に「対象が今も一般ユーザーである」条件を付けて 1 つの原子的な単位で実行する。
 * 昇格されていた場合は何も削除されず false を返す（管理者のデータを巻き込まない）。
 *
 * 外部キーが RESTRICT の表（レポート・通知・いいね・感想・読書状況・お気に入り著者）は、
 * 先に削除してからユーザーを削除する。
 *
 * @returns 削除できたら true。対象が存在しない、または一般ユーザーでなければ false。
 */
export async function deleteNonAdminUser(userId: number): Promise<boolean> {
  const stillUser = { role: "user" } as const;

  const results = await atomically([
    prisma.report.deleteMany({ where: { userId, user: stillUser } }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { userId, user: stillUser },
          { actorId: userId, actor: stillUser, type: { in: MUTUAL_NOTIFICATION_TYPES } },
        ],
      },
    }),
    prisma.like.deleteMany({ where: { userId, user: stillUser } }),
    prisma.review.deleteMany({ where: { userId, user: stillUser } }),
    prisma.readingStatus.deleteMany({ where: { userId, user: stillUser } }),
    prisma.favoriteAuthor.deleteMany({ where: { userId, user: stillUser } }),
    prisma.session.deleteMany({ where: { userId, user: stillUser } }),
    prisma.account.deleteMany({ where: { userId, user: stillUser } }),
    prisma.user.deleteMany({ where: { id: userId, role: "user" } }),
  ]);

  return (results[results.length - 1] as { count: number }).count > 0;
}
