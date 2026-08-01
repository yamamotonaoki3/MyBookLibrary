import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";


export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const totalLikes = await prisma.like.count({
      where: { review: { userId: userId } },
    });

    return NextResponse.json({ totalLikes });
  } catch (e) {
    logger.error({ err: e }, "[GET /api/reviews/stats]");
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
