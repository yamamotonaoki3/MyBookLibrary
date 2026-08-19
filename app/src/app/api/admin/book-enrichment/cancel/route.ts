import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const job = await prisma.bookEnrichmentJob.findFirst({
      where: { status: "running" },
    });
    if (!job) {
      return NextResponse.json({ error: "実行中の補完処理はありません。" }, { status: 404 });
    }

    // 実際の中断処理（未処理アイテムのcancelled化・監査ログ記録）は
    // ワーカー側(processEnrichmentJob)がこのフラグを検知したタイミングで行う。
    await prisma.bookEnrichmentJob.update({
      where: { id: job.id },
      data: { cancelRequested: true },
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/admin/book-enrichment/cancel]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
