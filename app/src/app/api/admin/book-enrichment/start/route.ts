import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { logger } from "@/lib/logger";

const ACTIVE_JOB_SLOT = "book-enrichment";

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  try {
    const runningJob = await prisma.bookEnrichmentJob.findFirst({
      where: { status: "running" },
    });
    if (runningJob) {
      return NextResponse.json(
        { error: "既に補完処理が実行中です。", jobId: runningJob.id },
        { status: 409 }
      );
    }

    const targets = await prisma.book.findMany({
      where: {
        OR: [{ isbn: null }, { coverImageUrl: null }, { publishedAtUnknown: true }],
      },
      select: { id: true },
    });

    if (targets.length === 0) {
      return NextResponse.json({ error: "補完が必要な本はありません。" }, { status: 400 });
    }

    const startedAt = new Date();
    const job = await prisma.bookEnrichmentJob.create({
      data: {
        status: "running",
        activeSlot: ACTIVE_JOB_SLOT,
        totalCount: targets.length,
        startedByUserId: userId,
        startedAt,
        lastTickAt: startedAt,
        items: {
          createMany: { data: targets.map((t) => ({ bookId: t.id })) },
        },
      },
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_STARTED,
      actorUserId: userId,
      detail: { jobId: job.id, totalCount: job.totalCount },
      ipAddress: getClientIp(request),
    });

    // EC2上で常駐しているプロセス内でそのままワーカーを起動する（レスポンスは待たない）
    void processEnrichmentJob(job.id).catch((err) => {
      logger.error({ err, jobId: job.id }, "[POST /api/admin/book-enrichment/start] worker failed");
    });

    return NextResponse.json({ jobId: job.id, totalCount: job.totalCount });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const runningJob = await prisma.bookEnrichmentJob.findFirst({
        where: { activeSlot: ACTIVE_JOB_SLOT },
      });
      return NextResponse.json(
        { error: "既に補完処理が実行中です。", jobId: runningJob?.id },
        { status: 409 }
      );
    }
    logger.error({ err: error }, "[POST /api/admin/book-enrichment/start]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
