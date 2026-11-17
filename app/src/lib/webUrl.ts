/** Browser navigation/image URLs only. Never fetch these URLs on the server. */
export function getSafeWebUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!/^https?:\/\//i.test(candidate) || /[\s\u0000-\u001f\u007f\\]/.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
