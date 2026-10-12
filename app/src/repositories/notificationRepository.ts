import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prismaErrors";

/**
 * 通知を作成する。同じ宛先・種類・本（userId, type, bookIsbn）の通知が既にある場合は、何もしない。
 *
 * `createMany({ skipDuplicates: true })` は SQLite（D1）で使えないため、MySQL と D1 の両方で動く
 * 「作成して、一意制約違反なら無視する」形にしている。既存の通知は変更しない。
 * ISBN が null の通知は、一意制約上は別の行として共存するため、常に作成される。
 *
 * @returns 作成したら true。既に同じ通知があって何もしなかったら false。
 */
export async function createNotificationIfAbsent(data: Prisma.NotificationUncheckedCreateInput): Promise<boolean> {
  try {
    await prisma.notification.create({ data });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
}
