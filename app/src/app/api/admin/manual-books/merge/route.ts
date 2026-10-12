import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mergeManualBook } from "@/repositories/manualBookRepository";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  try {
    const { sourceBookId, targetBookId } = await request.json();
    if (
      typeof sourceBookId !== "number" ||
      typeof targetBookId !== "number" ||
      sourceBookId === targetBookId
    ) {
      return NextResponse.json(
        { error: "sourceBookId, targetBookId を正しく指定してください。" },
        { status: 400 }
      );
    }

    const [sourceBook, targetBook] = await Promise.all([
      prisma.book.findUnique({ where: { id: sourceBookId } }),
      prisma.book.findUnique({ where: { id: targetBookId } }),
    ]);
    if (!sourceBook || sourceBook.source !== "manual") {
      return NextResponse.json({ error: "統合元の本が見つかりません。" }, { status: 404 });
    }
    if (!targetBook) {
      return NextResponse.json({ error: "統合先の本が見つかりません。" }, { status: 404 });
    }

    await mergeManualBook({ sourceBookId, targetBookId });

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_MANUAL_BOOK_MERGED,
      actorUserId: userId,
      targetType: "Book",
      targetId: targetBookId,
      detail: { sourceBookId, sourceTitle: sourceBook.title },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/admin/manual-books/merge]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
