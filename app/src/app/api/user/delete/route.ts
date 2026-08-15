import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  if (user.role === "admin") {
    return NextResponse.json(
      { error: "管理者アカウントは削除できません" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.report.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { userId },
          { actorId: userId, type: { in: ["mutual_favorite_author", "mutual_want_to_read"] } },
        ],
      },
    }),
    prisma.like.deleteMany({ where: { userId } }),
    prisma.review.deleteMany({ where: { userId } }),
    prisma.readingStatus.deleteMany({ where: { userId } }),
    prisma.favoriteAuthor.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // 削除対象のユーザー自身が行為者のため、既に存在しないIDをactorUserIdに残さない
  await recordAuditEvent({
    eventType: AUDIT_EVENT.USER_SELF_DELETED,
    actorUserId: null,
    actorEmail: user.email,
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ message: "アカウントを削除しました" });
}
