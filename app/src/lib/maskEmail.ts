/**
 * メールアドレスの部分表示（マスク）。管理画面・管理者 API が、ほかのユーザーのメールを
 * そのまま出さないために使う。見分けがつく程度（先頭の数文字と、ドメインの先頭・末尾の区切り）だけ残す。
 * 例: `demo_mio@example.com` → `de***@e***.com`
 */

const EMAIL_PATTERN = /[^\s@"'<>()[\]\,;:]+@[^\s@"'<>()[\]\,;:]+\.[^\s@"'<>()[\]\,;:]+/g;

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keepLocal = local.length >= 3 ? 2 : 1;
  const dot = domain.lastIndexOf(".");
  const maskedDomain = dot > 0 ? `${domain.slice(0, 1)}***${domain.slice(dot)}` : `${domain.slice(0, 1)}***`;
  return `${local.slice(0, keepLocal)}***@${maskedDomain}`;
}

/** null / undefined はそのまま返す（任意項目のメールに使う）。 */
export function maskEmailOrNull(email: string | null | undefined): string | null {
  return email == null ? null : maskEmail(email);
}

/** 文章や JSON の中のメールアドレスを、すべてマスクする（監査ログの detail など、形が決まっていない値向け）。 */
export function maskEmailsDeep<T>(value: T): T {
  if (typeof value === "string") return value.replace(EMAIL_PATTERN, (m) => maskEmail(m)) as T;
  if (Array.isArray(value)) return value.map((v) => maskEmailsDeep(v)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskEmailsDeep(v)])) as T;
  }
  return value;
}
