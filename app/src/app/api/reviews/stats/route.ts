import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";


export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const totalLikes = await prisma.like.count({
      where: { review: { userId: userId } },
    });

    return NextResponse.json({ totalLikes });
  } catch (e) {
    console.error("[GET /api/reviews/stats]", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
