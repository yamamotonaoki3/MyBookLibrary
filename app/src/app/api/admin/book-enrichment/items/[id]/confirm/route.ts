import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { logger } from "@/lib/logger";

type Props = {
  params: Promise<{ id: string }>;
};

type ResultDetail = {
  candidates?: { title: string; author: string; isbn: string; lamp: "green" | "red" }[];
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
    const body = await request.json();
    const selectedIsbn = typeof body.isbn === "string" ? body.isbn : null;
    if (!selectedIsbn) {
      return NextResponse.json({ error: "ISBNを指定してください。" }, { status: 400 });
    }

    const item = await prisma.bookEnrichmentItem.findUnique({ where: { id: itemId } });
    if (!item || item.status !== "needs_review") {
      return NextResponse.json({ error: "確認待ちの項目が見つかりません。" }, { status: 404 });
    }

    const detail = item.resultDetail as ResultDetail | null;
    const candidate = detail?.candidates?.find((c) => c.isbn === selectedIsbn);
    if (!candidate) {
      return NextResponse.json({ error: "指定されたISBNは候補に含まれていません。" }, { status: 400 });
    }

    await prisma.book.update({
      where: { id: item.bookId },
      data: { isbn: selectedIsbn },
    });

    await prisma.bookEnrichmentItem.update({
      where: { id: itemId },
      data: { status: "done" },
    });

    await prisma.bookEnrichmentJob.update({
      where: { id: item.jobId },
      data: { reviewCount: { decrement: 1 }, successCount: { increment: 1 } },
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_CONFIRMED,
      actorUserId: userId,
      detail: { itemId, bookId: item.bookId, isbn: selectedIsbn },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "指定されたISBNは既に別の本に登録されています。" },
        { status: 409 }
      );
    }
    logger.error({ err: error }, "[POST /api/admin/book-enrichment/items/[id]/confirm]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
