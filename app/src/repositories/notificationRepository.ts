import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prismaErrors";
import { insertInChunks } from "@/lib/chunk";

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

/** notifications の列の数（既定値のある列も、1 行ぶんのバインドパラメータに数える）。 */
const NOTIFICATION_COLUMNS = 10;

/**
 * 通知を一括で作成する。宛先の数に比例して行が増えるため、D1 ではバインドパラメータの上限（100 個）を超えないよう、
 * 一定の行数ごとに分けて登録する（途中で失敗すると、それまでの分は残る）。
 * MySQL は従来どおり 1 回の `createMany`（失敗すれば全体を取り消す）で登録する。
 *
 * @returns 作成した件数。
 */
export async function createNotificationsInChunks(data: Prisma.NotificationCreateManyInput[]): Promise<number> {
  if (process.env.DB_PROVIDER !== "d1") return (await prisma.notification.createMany({ data })).count;
  return insertInChunks(data, NOTIFICATION_COLUMNS, (rows) => prisma.notification.createMany({ data: rows }));
}
