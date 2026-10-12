import { prisma } from "@/lib/prisma";
import { atomically, d1Timestamp } from "@/lib/atomically";

/**
 * 管理者によるパスワードリセットを反映する。パスワードの更新（要変更フラグの設定・ロックの解除を含む）と
 * 本人への通知の作成を、原子的に実行する。
 *
 * どちらかだけが失敗すると、一時パスワードが失われて管理者も本人も新しいパスワードを知りえず、
 * ロックアウトされてしまうため、両方が成功するか両方とも取り消されるかのどちらかにする。
 */
export async function applyAdminPasswordReset(params: {
  userId: number;
  passwordHash: string;
  noticeContent: string;
}): Promise<void> {
  const { userId, passwordHash, noticeContent } = params;
  const NOTICE_TYPE = "password_reset_by_admin";

  await atomically([
    {
      prisma: () =>
        prisma.user.update({
          where: { id: userId },
          data: {
            password: passwordHash,
            mustChangePassword: true,
            loginFailCount: 0,
            lockedUntil: null,
          },
        }),
      d1: {
        sql: `UPDATE users
              SET password = ?, must_change_password = 1, login_fail_count = 0, locked_until = NULL
              WHERE id = ?`,
        params: [passwordHash, userId],
      },
      requireRow: true,
    },
    {
      prisma: () =>
        prisma.notification.create({
          data: { userId, type: NOTICE_TYPE, content: noticeContent },
        }),
      d1: {
        sql: `INSERT INTO notifications (user_id, type, content, is_read, created_at)
              VALUES (?, ?, ?, 0, ?)`,
        params: [userId, NOTICE_TYPE, noticeContent, d1Timestamp()],
      },
    },
  ]);
}
