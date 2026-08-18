import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

const MAX_FAILED_ITEMS_SHOWN = 50;
const MAX_REVIEW_ITEMS_SHOWN = 50;

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const jobIdParam = request.nextUrl.searchParams.get("jobId");
    const job = jobIdParam
      ? await prisma.bookEnrichmentJob.findUnique({ where: { id: Number(jobIdParam) } })
      : await prisma.bookEnrichmentJob.findFirst({ orderBy: { id: "desc" } });

    if (!job) {
      return NextResponse.json({ job: null });
    }

    const failedItems = await prisma.bookEnrichmentItem.findMany({
      where: { jobId: job.id, status: "error" },
      include: { book: { select: { title: true } } },
      orderBy: { id: "asc" },
      take: MAX_FAILED_ITEMS_SHOWN,
    });

    const reviewItems = await prisma.bookEnrichmentItem.findMany({
      where: { jobId: job.id, status: "needs_review" },
      include: { book: { select: { title: true } } },
      orderBy: { id: "asc" },
      take: MAX_REVIEW_ITEMS_SHOWN,
    });

    return NextResponse.json({
      job,
      failedItems: failedItems.map((i) => ({
        bookId: i.bookId,
        title: i.book.title,
        errorMessage: i.errorMessage,
      })),
      reviewItems: reviewItems.map((i) => ({
        id: i.id,
        bookId: i.bookId,
        title: i.book.title,
        resultDetail: i.resultDetail,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/book-enrichment/status]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
