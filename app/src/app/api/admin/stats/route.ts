import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
    console.error("[GET /api/admin/stats]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
