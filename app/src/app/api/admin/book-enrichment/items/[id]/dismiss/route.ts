import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { logger } from "@/lib/logger";

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Props) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const itemId = Number(id);
  if (Number.isNaN(itemId)) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  try {
    const item = await prisma.bookEnrichmentItem.findUnique({ where: { id: itemId } });
    if (!item || item.status !== "needs_review") {
      return NextResponse.json({ error: "確認待ちの項目が見つかりません。" }, { status: 404 });
    }

    await prisma.bookEnrichmentItem.update({
      where: { id: itemId },
      data: { status: "dismissed" },
    });

    await prisma.bookEnrichmentJob.update({
      where: { id: item.jobId },
      data: { reviewCount: { decrement: 1 } },
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_DISMISSED,
      actorUserId: userId,
      detail: { itemId, bookId: item.bookId },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/admin/book-enrichment/items/[id]/dismiss]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
