import { prisma } from "@/lib/prisma";
import { AUDIT_EVENT } from "@/lib/auditEvents";

export type EmailRevealKind = "user" | "inquiry" | "audit-log";

/** 「表示」ボタンで見せるメールアドレスを取り出す。対象がない（または、メールがない）ときは null。 */
export async function findEmailToReveal(kind: EmailRevealKind, id: number): Promise<string | null> {
  switch (kind) {
    case "user":
      return (await prisma.user.findUnique({ where: { id }, select: { email: true } }))?.email ?? null;
    case "inquiry":
      return (await prisma.contactInquiry.findUnique({ where: { id }, select: { email: true } }))?.email ?? null;
    case "audit-log": {
      const log = await prisma.auditLog.findUnique({
        where: { id },
        select: { actorEmail: true, actorUser: { select: { email: true } } },
      });
      // 画面の表示（actorEmail）と同じ値を返す。actorEmail が無いときだけ、実行者ユーザーのメールを使う
      return log?.actorEmail ?? log?.actorUser?.email ?? null;
    }
  }
}

/** この管理者が、指定した時刻以降に「表示」を要求した回数（自分の記録を含む）。回数制限に使う。 */
export function countRecentReveals(adminUserId: number, since: Date): Promise<number> {
  return prisma.auditLog.count({
    where: { eventType: AUDIT_EVENT.ADMIN_EMAIL_REVEALED, actorUserId: adminUserId, createdAt: { gte: since } },
  });
}

/** 表示させなかった要求の記録に、その理由を残す。失敗しても、記録は「表示した」まま残る（安全側）。 */
export async function markRevealDenied(auditLogId: number, reason: string): Promise<void> {
  await prisma.auditLog.update({ where: { id: auditLogId }, data: { detail: { granted: false, reason } } });
}
