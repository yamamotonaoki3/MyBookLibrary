import { prisma } from "@/lib/prisma";
import { atomically, type AtomicStep } from "@/lib/atomically";

const MUTUAL_NOTIFICATION_TYPES = ["mutual_favorite_author", "mutual_want_to_read"];

/** D1 用: 対象が今も一般ユーザーである、という条件（削除対象の行に付ける）。 */
const STILL_REGULAR_USER_SQL = "EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'user')";

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

  /** `user_id = ?` の行を、対象が一般ユーザーである場合に限って削除する。 */
  const deleteOwnedRows = (table: string, deleteMany: AtomicStep["prisma"]): AtomicStep => ({
    prisma: deleteMany,
    d1: { sql: `DELETE FROM ${table} WHERE user_id = ? AND ${STILL_REGULAR_USER_SQL}`, params: [userId, userId] },
  });

  const counts = await atomically([
    deleteOwnedRows("reports", () => prisma.report.deleteMany({ where: { userId, user: stillUser } })),
    {
      prisma: () =>
        prisma.notification.deleteMany({
          where: {
            OR: [
              { userId, user: stillUser },
              { actorId: userId, actor: stillUser, type: { in: MUTUAL_NOTIFICATION_TYPES } },
            ],
          },
        }),
      d1: {
        sql: `DELETE FROM notifications
              WHERE (user_id = ? OR (actor_id = ? AND type IN (${MUTUAL_NOTIFICATION_TYPES.map(() => "?").join(", ")})))
                AND ${STILL_REGULAR_USER_SQL}`,
        params: [userId, userId, ...MUTUAL_NOTIFICATION_TYPES, userId],
      },
    },
    deleteOwnedRows("likes", () => prisma.like.deleteMany({ where: { userId, user: stillUser } })),
    deleteOwnedRows("reviews", () => prisma.review.deleteMany({ where: { userId, user: stillUser } })),
    deleteOwnedRows("reading_statuses", () => prisma.readingStatus.deleteMany({ where: { userId, user: stillUser } })),
    deleteOwnedRows("favorite_authors", () => prisma.favoriteAuthor.deleteMany({ where: { userId, user: stillUser } })),
    deleteOwnedRows("sessions", () => prisma.session.deleteMany({ where: { userId, user: stillUser } })),
    deleteOwnedRows("accounts", () => prisma.account.deleteMany({ where: { userId, user: stillUser } })),
    {
      prisma: () => prisma.user.deleteMany({ where: { id: userId, role: "user" } }),
      d1: { sql: "DELETE FROM users WHERE id = ? AND role = 'user'", params: [userId] },
    },
  ]);

  return counts[counts.length - 1] > 0;
}
