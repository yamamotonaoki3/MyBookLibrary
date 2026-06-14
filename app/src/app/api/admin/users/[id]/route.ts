import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const targetId = Number(id);

  if (isNaN(targetId)) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }

  if (userId === targetId) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 404 }
    );
  }

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "管理者アカウントは削除できません" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.report.deleteMany({ where: { userId: targetId } }),
    prisma.notification.deleteMany({ where: { userId: targetId } }),
    prisma.like.deleteMany({ where: { userId: targetId } }),
    prisma.review.deleteMany({ where: { userId: targetId } }),
    prisma.readingStatus.deleteMany({ where: { userId: targetId } }),
    prisma.favoriteAuthor.deleteMany({ where: { userId: targetId } }),
    prisma.session.deleteMany({ where: { userId: targetId } }),
    prisma.account.deleteMany({ where: { userId: targetId } }),
    prisma.user.delete({ where: { id: targetId } }),
  ]);

  return NextResponse.json({ message: "ユーザーを削除しました" });
}
