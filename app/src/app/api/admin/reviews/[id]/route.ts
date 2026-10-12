import { prisma } from "@/lib/prisma";
import { atomically } from "@/lib/atomically";
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
    const notificationData = {
      userId: review.userId,
      type: "review_deleted",
      content: "不適切な内容があったため、レビューは削除されました。",
      bookIsbn,
      bookTitle: review.book.title,
      isRead: false,
    };
    // 通知の作成と感想の削除は、読み取りを挟まない 2 文として原子的に実行する
    const writeNotification =
      bookIsbn !== null
        ? // 複合一意キー (userId, type, bookIsbn) を使ったupsertで原子的に読み書きし、
          // 同時実行時に「両方ともfindFirstでnullを見てcreateし合い一意制約違反になる」競合を避ける。
          prisma.notification.upsert({
            where: { userId_type_bookIsbn: { userId: review.userId, type: "review_deleted", bookIsbn } },
            create: notificationData,
            update: { ...notificationData, createdAt: new Date() },
          })
        : // bookIsbn が null の場合、一意制約上は複数行が共存しうる（MySQLはNULL同士を別値扱いする）ため、
          // 複合一意キーでのupsertは使えず、常に新規作成する（本ごとの通知を混同・上書きしないため）。
          prisma.notification.create({ data: notificationData });
    await atomically([writeNotification, prisma.review.delete({ where: { id: reviewId } })]);
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
