import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    await prisma.$transaction(async (tx) => {
      // ReadingStatus: 統合先に同一ユーザーの行が既にあれば統合元の行を破棄する
      const sourceStatuses = await tx.readingStatus.findMany({ where: { bookId: sourceBookId } });
      for (const status of sourceStatuses) {
        const existing = await tx.readingStatus.findUnique({
          where: { userId_bookId: { userId: status.userId, bookId: targetBookId } },
        });
        if (existing) {
          await tx.readingStatus.delete({ where: { id: status.id } });
        } else {
          await tx.readingStatus.update({
            where: { id: status.id },
            data: { bookId: targetBookId },
          });
        }
      }

      // AwardEntry: 統合先に同一の賞・年度の組み合わせが既にあれば統合元の行を破棄する
      const sourceEntries = await tx.awardEntry.findMany({ where: { bookId: sourceBookId } });
      for (const entry of sourceEntries) {
        const existing = await tx.awardEntry.findUnique({
          where: {
            bookId_awardId_year: { bookId: targetBookId, awardId: entry.awardId, year: entry.year },
          },
        });
        if (existing) {
          await tx.awardEntry.delete({ where: { id: entry.id } });
        } else {
          await tx.awardEntry.update({
            where: { id: entry.id },
            data: { bookId: targetBookId },
          });
        }
      }

      // Review: 一意制約が無いためそのまま付け替える
      await tx.review.updateMany({
        where: { bookId: sourceBookId },
        data: { bookId: targetBookId },
      });

      await tx.book.delete({ where: { id: sourceBookId } });
    });

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
