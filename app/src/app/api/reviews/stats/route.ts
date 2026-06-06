import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function GET() {
  try {
    const totalLikes = await prisma.like.count({
      where: { review: { userId: TEMP_USER_ID } },
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
