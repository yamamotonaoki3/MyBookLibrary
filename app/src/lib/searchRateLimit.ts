/** 外部APIを守る検索間隔。E2Eでは0で無効化できる。 */
export function getSearchRateLimitIntervalMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.SEARCH_RATE_LIMIT_INTERVAL_MS;
  if (!raw?.trim()) return 500;
  const interval = Number(raw);
  return Number.isFinite(interval) && interval >= 0 ? interval : 500;
}
