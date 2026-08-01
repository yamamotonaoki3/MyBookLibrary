import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const books = await prisma.book.findMany({
      where: { source: "manual" },
      include: {
        author: true,
        createdByUser: { select: { id: true, name: true, email: true } },
        _count: { select: { readingStatuses: true, reviews: true } },
      },
      orderBy: { id: "desc" },
    });
    return NextResponse.json(books);
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/manual-books]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
