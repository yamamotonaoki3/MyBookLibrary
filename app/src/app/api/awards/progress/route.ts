import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";


export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const awards = await prisma.award.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        awardEntries: {
          select: { bookId: true },
        },
      },
    });

    const result = await Promise.all(
      awards.map(async (award) => {
        const bookIds = award.awardEntries.map((e) => e.bookId);
        const total = bookIds.length;
        const read = await prisma.readingStatus.count({
          where: {
            userId: userId,
            status: "read",
            bookId: { in: bookIds },
          },
        });
        return { id: award.id, name: award.name, total, read };
      })
    );

    return NextResponse.json({ awards: result });
  } catch (error) {
    console.error("[GET /api/awards/progress]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
