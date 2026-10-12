import { prisma } from "@/lib/prisma";
import { sumInChunks } from "@/lib/chunk";

/**
 * 指定した本のうち、ユーザーが「読了」にしている本の数を返す。
 * 本の数に比例して `IN` の値が増え、D1 のバインドパラメータの上限（100 個）を超えるため、分割して数える。
 * 同じ本が重複していても 1 冊として数える。
 */
export function countReadBooks(userId: number, bookIds: readonly number[]): Promise<number> {
  return sumInChunks([...new Set(bookIds)], (part) =>
    prisma.readingStatus.count({ where: { userId, status: "read", bookId: { in: part } } })
  );
}
