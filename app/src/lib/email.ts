/**
 * メールアドレスの正規化（前後の空白の除去と小文字化）。
 *
 * MySQL の既定の照合順序は大文字小文字を区別しないが、D1（SQLite）の文字列比較は区別する。
 * どちらの DB でも同じ結果にするため、保存時と検索時の両方でこの関数を通す
 * （docs/archive/cloudflare-d1-migration-plan.md §5-2）。
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
