import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/** D1 で実行する 1 文（`?` のプレースホルダーと、その値）。 */
export type D1Statement = { sql: string; params?: readonly unknown[] };

/**
 * 原子的に実行する 1 つの書き込み。
 * MySQL では Prisma の操作を、D1 では**同じ意味の SQL** を実行する（2 つの表現は同じ結果になること。
 * 両 DB の結合テストで担保する）。
 */
export type AtomicStep = {
  prisma: () => Prisma.PrismaPromise<unknown>;
  d1: D1Statement;
  /**
   * 対象の行が 1 件以上なければ、全体を失敗にして取り消す。
   * Prisma の単一レコードの `update` / `delete` は対象がないと例外になるが、D1 の SQL は 0 件でも成功するため、
   * それらの書き込みには必ず指定する（`deleteMany` / `updateMany` / `create` / `upsert` には不要）。
   */
  requireRow?: boolean;
};

/** `requireRow` の対象が見つからなかったときのエラー。Prisma の P2025（対象なし）と同じコードを持つ。 */
export class AtomicTargetMissingError extends Error {
  readonly code = "P2025";
  constructor() {
    super("原子的に実行する書き込みの対象の行が見つかりません。");
    this.name = "AtomicTargetMissingError";
  }
}

/** D1 に保存する日時（Prisma の D1 アダプタと同じ ISO 8601 の文字列）。 */
export const d1Timestamp = (date: Date = new Date()): string => date.toISOString();

/**
 * 読み取りを挟まない複数の書き込みを、1 つの原子的な単位として実行する。途中で失敗したら全体が取り消される。
 *
 * D1 では Prisma の `$transaction` が**エラーにならず非原子的に実行される**ため、原子化が必要な
 * 複数文の書き込みは必ずこの関数を経由させる。MySQL では `$transaction` の配列形式、
 * D1 では D1 の `batch`（原子的）で実行する（docs/archive/cloudflare-d1-migration-plan.md §5-3）。
 *
 * 途中の読み取り結果に依存する処理（読み取り→判定→更新）は渡せない。その場合は条件付きの単一文に畳むこと。
 * Prisma を直接呼ぶ箇所は repositories に置く（責務分離ルール）。
 *
 * @returns 各書き込みの影響行数（`deleteMany` / `updateMany` は件数、単一レコードの操作は 1）
 */
export async function atomically(steps: AtomicStep[]): Promise<number[]> {
  if (process.env.DB_PROVIDER === "d1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runD1Batch } = require("@/lib/atomicallyD1") as typeof import("@/lib/atomicallyD1");
    return runD1Batch(steps.map(({ d1, requireRow }) => ({ ...d1, requireRow })));
  }

  const results = await prisma.$transaction(steps.map((step) => step.prisma()));
  return results.map((result) =>
    typeof result === "object" && result !== null && "count" in result && typeof result.count === "number"
      ? result.count
      : 1
  );
}
