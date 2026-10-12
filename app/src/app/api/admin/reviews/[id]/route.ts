import { prisma } from "@/lib/prisma";
import { deleteReviewWithNotice } from "@/repositories/reviewModerationRepository";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { book: true },
    });
    if (!review) {
      return Response.json({ error: "レビューが見つかりません。" }, { status: 404 });
    }
    const bookIsbn = review.book.isbn ?? null;
    // 通知の作成と感想の削除は、原子的に実行する
    await deleteReviewWithNotice({
      reviewId,
      notice: {
        userId: review.userId,
        bookIsbn,
        bookTitle: review.book.title,
        content: "不適切な内容があったため、レビューは削除されました。",
      },
    });
    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_REVIEW_DELETED,
      actorUserId: userId,
      targetType: "Review",
      targetId: reviewId,
      detail: { reviewUserId: review.userId, bookTitle: review.book.title },
      ipAddress: getClientIp(req),
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    logger.error({ err, reviewId }, "レビュー削除に失敗しました");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
