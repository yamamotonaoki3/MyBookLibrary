/**
 * 件数に比例するクエリ（`IN` / `OR` / `createMany`）を、一定件数ごとに分けて実行するためのヘルパー。
 *
 * Cloudflare D1 は 1 回のクエリのバインドパラメータが 100 個までで、超えると失敗する（MySQL は動く）。
 * 利用者のデータ量や CSV の行数に比例して値が増える箇所は、これで分割する。
 */

/** `IN (...)` に渡す値の 1 回あたりの上限。`userId` などの固定条件のぶんを残して、100 個を超えないようにする。 */
export const IN_CLAUSE_CHUNK_SIZE = 50;

/** 1 回のクエリのバインドパラメータの上限（D1）に、余裕を持たせた値。 */
const BIND_PARAMETER_BUDGET = 90;

export function chunk<T>(items: readonly T[], size: number = IN_CLAUSE_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("chunk size must be a positive integer");
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/** 値を分割して順に問い合わせ、結果を 1 つの配列にまとめる。`items` が空なら問い合わせない。 */
export async function flatMapInChunks<T, R>(
  items: readonly T[],
  query: (chunk: T[]) => Promise<R[]>,
  size: number = IN_CLAUSE_CHUNK_SIZE
): Promise<R[]> {
  const results: R[] = [];
  for (const part of chunk(items, size)) results.push(...(await query(part)));
  return results;
}

/** 値を分割して順に件数を数え、合計を返す。値が重複しない（分割した各回で別の行を数える）前提で使う。 */
export async function sumInChunks<T>(
  items: readonly T[],
  count: (chunk: T[]) => Promise<number>,
  size: number = IN_CLAUSE_CHUNK_SIZE
): Promise<number> {
  let total = 0;
  for (const part of chunk(items, size)) total += await count(part);
  return total;
}

/**
 * `createMany` の 1 回あたりの行数。1 行あたりのバインドパラメータ数（列の数。既定値のある列も含める）から、
 * 1 回のクエリが上限を超えない行数を求める。
 */
export function rowsPerInsert(columnsPerRow: number): number {
  return Math.max(1, Math.floor(BIND_PARAMETER_BUDGET / columnsPerRow));
}

/** 行を分割して順に登録する。`insert` は 1 回分の行を受け取り、登録した件数を返す。 */
export async function insertInChunks<T>(
  rows: readonly T[],
  columnsPerRow: number,
  insert: (rows: T[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (const part of chunk(rows, rowsPerInsert(columnsPerRow))) total += (await insert(part)).count;
  return total;
}

/** 複数回の問い合わせの結果を 1 つにまとめるとき、同じ行（`key` が同じもの）を 1 つにする。 */
export function uniqueBy<T, K>(rows: readonly T[], key: (row: T) => K): T[] {
  const seen = new Map<K, T>();
  for (const row of rows) if (!seen.has(key(row))) seen.set(key(row), row);
  return [...seen.values()];
}
