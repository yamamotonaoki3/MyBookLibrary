import { prisma } from "@/lib/prisma";

/**
 * 管理者数に条件を付けたロール変更。
 *
 * 「管理者数を数える → 判定する → 更新する」を 1 つの UPDATE 文に畳んで原子化する
 * （FOR UPDATE による行ロックは MySQL 固有のため使わない。docs/cloudflare-d1-migration-plan.md §4-4・§5-3）。
 * 管理者数の副問い合わせは、MySQL の「更新対象テーブルを副問い合わせで参照できない」制約
 * （エラー 1093）を避けるため、導出テーブル（LIMIT 付きで必ず実体化させる）経由で数える。
 */

/**
 * MySQL では、同時に複数の昇降格が走ると InnoDB がデッドロックとして片方を中断する
 * （中断された側は何も更新されないため、管理者がいなくなったり上限を超えたりはしない）。
 * 中断された側を再実行すれば、最新の管理者数で正しく判定される。
 */
const MAX_DEADLOCK_RETRIES = 3;

function isDeadlockError(err: unknown): boolean {
  return err instanceof Error && /deadlock/i.test(err.message);
}

async function retryOnDeadlock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (!isDeadlockError(err) || attempt >= MAX_DEADLOCK_RETRIES) throw err;
    }
  }
}

/** 管理者数の副問い合わせで走査する上限。管理者の上限数（MAX_ADMIN_COUNT）より十分大きければよい。 */
const ADMIN_SCAN_LIMIT = 1000;

/**
 * 管理者を一般ユーザーへ降格する。ただし最後の 1 人の場合は何もしない。
 * @returns 降格できたら true。対象が管理者でない、または最後の管理者なら false。
 */
export async function demoteAdminUnlessLast(userId: number): Promise<boolean> {
  const affected = await retryOnDeadlock(() => prisma.$executeRaw`
    UPDATE users
    SET role = 'user'
    WHERE id = ${userId}
      AND role = 'admin'
      AND (
        SELECT COUNT(*) FROM (
          SELECT id FROM users WHERE role = 'admin' LIMIT ${ADMIN_SCAN_LIMIT}
        ) AS admins
      ) > 1
  `);
  return affected > 0;
}

/**
 * 一般ユーザーを管理者へ昇格する。ただし管理者数が上限に達している場合は何もしない。
 * @returns 昇格できたら true。対象が一般ユーザーでない、または上限に達しているなら false。
 */
export async function promoteToAdminUnderLimit(userId: number, maxAdmins: number): Promise<boolean> {
  const affected = await retryOnDeadlock(() => prisma.$executeRaw`
    UPDATE users
    SET role = 'admin'
    WHERE id = ${userId}
      AND role = 'user'
      AND (
        SELECT COUNT(*) FROM (
          SELECT id FROM users WHERE role = 'admin' LIMIT ${ADMIN_SCAN_LIMIT}
        ) AS admins
      ) < ${maxAdmins}
  `);
  return affected > 0;
}
