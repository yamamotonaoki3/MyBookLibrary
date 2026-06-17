import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { NextResponse } from "next/server";

export async function DELETE() {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
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
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.like.deleteMany({ where: { userId } }),
    prisma.review.deleteMany({ where: { userId } }),
    prisma.readingStatus.deleteMany({ where: { userId } }),
    prisma.favoriteAuthor.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return NextResponse.json({ message: "アカウントを削除しました" });
}
