/**
 * 照合用の正規化と SHA-256。MySQL と D1 から Prisma で読んだ値を、同じ文字列表現に揃えて比較する。
 * 値そのものは出力せず、ハッシュだけを比較する（個人情報を画面・ログに出さない）。
 */
import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 値を、型の違いも区別できる文字列にする（`1` と `"1"`、`null` と空文字を区別する）。日時はミリ秒まで。 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
  if (typeof value === "number" || typeof value === "bigint") return `n:${String(value)}`;
  if (typeof value === "string") return `s:${value}`;
  if (value instanceof Uint8Array) return `x:${Buffer.from(value).toString("hex")}`;
  return `j:${stableStringify(value)}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * 行ごとのダイジェスト（キー → ダイジェスト）から、表全体のハッシュを求める。
 * DB の並び順（MySQL の大文字小文字を区別しない照合順序と、SQLite の順序の違い）に依存しないよう、キーで並べ直す。
 */
export function combineDigests(digests: Map<string, string>): string {
  const hash = createHash("sha256");
  for (const key of [...digests.keys()].sort()) {
    hash.update(`${key.length}:${key}${digests.get(key)}`, "utf8");
  }
  return hash.digest("hex");
}
