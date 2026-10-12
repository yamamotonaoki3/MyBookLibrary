import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { atomically } from "@/lib/atomically";
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

    // 統合先に既にある行と重複する統合元の行（同一ユーザーの読書状況・同一の賞と年度の受賞）を
    // 事前に特定し、削除・付け替え・統合元の削除を 1 つの原子的な単位で実行する。
    // 事前の読み取りと実行の間に競合が起きた場合は一意制約違反で全体が失敗し、再実行できる。
    const targetEntries = await prisma.awardEntry.findMany({
      where: { bookId: targetBookId },
      select: { awardId: true, year: true },
    });

    await atomically([
      // ReadingStatus: 統合先に同一ユーザーの行が既にあれば統合元の行を破棄し、残りを付け替える
      prisma.readingStatus.deleteMany({
        where: {
          bookId: sourceBookId,
          user: { readingStatuses: { some: { bookId: targetBookId } } },
        },
      }),
      prisma.readingStatus.updateMany({
        where: { bookId: sourceBookId },
        data: { bookId: targetBookId },
      }),
      // AwardEntry: 統合先に同一の賞・年度の組み合わせが既にあれば統合元の行を破棄し、残りを付け替える
      ...(targetEntries.length > 0
        ? [
            prisma.awardEntry.deleteMany({
              where: {
                bookId: sourceBookId,
                OR: targetEntries.map((e) => ({ awardId: e.awardId, year: e.year })),
              },
            }),
          ]
        : []),
      prisma.awardEntry.updateMany({
        where: { bookId: sourceBookId },
        data: { bookId: targetBookId },
      }),
      // Review: 一意制約が無いためそのまま付け替える
      prisma.review.updateMany({
        where: { bookId: sourceBookId },
        data: { bookId: targetBookId },
      }),
      prisma.book.delete({ where: { id: sourceBookId } }),
    ]);

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
