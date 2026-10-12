import { getD1Binding } from "@/lib/d1Binding";
import { AtomicTargetMissingError, type D1Statement } from "@/lib/atomically";

type D1StatementLike = { bind(...params: unknown[]): D1StatementLike };
type D1DatabaseLike = {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<{ meta?: { changes?: number } }[]>;
};

/**
 * 直前の書き込みが 0 行だったときにだけエラーにする文。`requireRow` の書き込みの直後に置く。
 * SQLite の `changes()` は直前の書き込みが変更した行数を返す。`json()` は不正な入力で例外になるため、
 * 0 行のときだけ不正な JSON を渡して batch 全体を失敗（取り消し）にする。
 */
const FAIL_IF_NO_ROW_CHANGED = "SELECT CASE WHEN changes() = 0 THEN json('x') END";
const MALFORMED_JSON = /malformed JSON/i;

export type D1BatchStatement = D1Statement & { requireRow?: boolean };

/**
 * DB_PROVIDER=d1 のときだけ読み込まれる、`atomically` の D1 実装。
 * D1 の `batch` は、渡した文を 1 つのトランザクションとして実行し、1 つでも失敗すると全体を取り消す。
 *
 * @returns 各書き込みの影響行数（`requireRow` のために挿入する検査用の文は含めない）
 */
export async function runD1Batch(statements: D1BatchStatement[]): Promise<number[]> {
  const db = getD1Binding() as D1DatabaseLike;

  const prepared: D1StatementLike[] = [];
  const writeIndexes: number[] = [];
  for (const { sql, params = [], requireRow } of statements) {
    writeIndexes.push(prepared.length);
    prepared.push(db.prepare(sql).bind(...params));
    if (requireRow) prepared.push(db.prepare(FAIL_IF_NO_ROW_CHANGED));
  }

  let results: Awaited<ReturnType<D1DatabaseLike["batch"]>>;
  try {
    results = await db.batch(prepared);
  } catch (error) {
    if (MALFORMED_JSON.test(String((error as Error)?.message) + String((error as { cause?: unknown })?.cause))) {
      throw new AtomicTargetMissingError();
    }
    throw error;
  }
  return writeIndexes.map((index) => results[index].meta?.changes ?? 0);
}
