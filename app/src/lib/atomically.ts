import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * 読み取りを挟まない複数の書き込みを、1 つの原子的な単位として実行する。
 *
 * D1 では Prisma の `$transaction`（配列形式）が**エラーにならず非原子的に実行される**ため、
 * 原子化が必要な複数文の書き込みは必ずこの関数を経由させる（docs/cloudflare-d1-migration-plan.md §5-3）。
 * MySQL では `$transaction` の配列形式、D1 対応時（Phase 2）は D1 の `batch` に差し替える。
 *
 * 途中の読み取り結果に依存する処理（読み取り→判定→更新）は渡せない。その場合は
 * 条件付きの単一文に畳むこと。
 */
export function atomically<P extends Prisma.PrismaPromise<unknown>[]>(operations: [...P]) {
  return prisma.$transaction(operations);
}
