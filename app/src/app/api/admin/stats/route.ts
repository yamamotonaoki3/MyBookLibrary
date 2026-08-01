import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [userCount, reviewCount, likeCount, newUsersThisMonth] =
      await Promise.all([
        prisma.user.count(),
        prisma.review.count(),
        prisma.like.count(),
        prisma.user.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
      ]);

    return NextResponse.json({
      userCount,
      reviewCount,
      likeCount,
      newUsersThisMonth,
    });
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/stats]");
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
