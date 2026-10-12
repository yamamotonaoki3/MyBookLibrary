import { prisma } from "@/lib/prisma";
import { atomically, d1Timestamp, type AtomicStep } from "@/lib/atomically";

const REVIEW_DELETED = "review_deleted";

/**
 * 管理者が感想を削除する。投稿者への通知の作成（または更新）と感想の削除を、原子的に実行する。
 *
 * ISBN がある本は、複合一意キー（userId, type, bookIsbn）を使った upsert で原子的に読み書きし、
 * 同時実行時に「両方とも存在を確認してから作成し合い、一意制約違反になる」競合を避ける。
 * ISBN が null の場合、一意制約上は複数行が共存しうる（NULL 同士は別の値として扱われる）ため、
 * upsert は使えず、常に新規作成する（本ごとの通知を混同・上書きしないため）。
 */
export async function deleteReviewWithNotice(params: {
  reviewId: number;
  notice: { userId: number; bookIsbn: string | null; bookTitle: string; content: string };
}): Promise<void> {
  const { reviewId, notice } = params;
  const { userId, bookIsbn, bookTitle, content } = notice;

  const notificationData = { userId, type: REVIEW_DELETED, content, bookIsbn, bookTitle, isRead: false };

  const writeNotice: AtomicStep =
    bookIsbn !== null
      ? {
          prisma: () =>
            prisma.notification.upsert({
              where: { userId_type_bookIsbn: { userId, type: REVIEW_DELETED, bookIsbn } },
              create: notificationData,
              update: { ...notificationData, createdAt: new Date() },
            }),
          d1: {
            sql: `INSERT INTO notifications (user_id, type, content, book_isbn, book_title, is_read, created_at)
                  VALUES (?, ?, ?, ?, ?, 0, ?)
                  ON CONFLICT (user_id, type, book_isbn) DO UPDATE SET
                    content = excluded.content,
                    book_title = excluded.book_title,
                    is_read = 0,
                    created_at = excluded.created_at`,
            params: [userId, REVIEW_DELETED, content, bookIsbn, bookTitle, d1Timestamp()],
          },
        }
      : {
          prisma: () => prisma.notification.create({ data: notificationData }),
          d1: {
            sql: `INSERT INTO notifications (user_id, type, content, book_isbn, book_title, is_read, created_at)
                  VALUES (?, ?, ?, NULL, ?, 0, ?)`,
            params: [userId, REVIEW_DELETED, content, bookTitle, d1Timestamp()],
          },
        };

  await atomically([
    writeNotice,
    {
      prisma: () => prisma.review.delete({ where: { id: reviewId } }),
      d1: { sql: "DELETE FROM reviews WHERE id = ?", params: [reviewId] },
      requireRow: true,
    },
  ]);
}
