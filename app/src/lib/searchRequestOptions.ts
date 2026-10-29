import { SEARCH_BUDGET_MS, SEARCH_NDL_TIMEOUT_MS, SEARCH_RAKUTEN_TIMEOUT_MS, SEARCH_RAKUTEN_TOTAL_TIMEOUT_MS } from "./searchTimeouts";

export function createSearchRequestOptions() {
  const signal = AbortSignal.timeout(SEARCH_BUDGET_MS);
  return {
    rakuten: { signal, timeoutMs: SEARCH_RAKUTEN_TIMEOUT_MS, totalTimeoutMs: SEARCH_RAKUTEN_TOTAL_TIMEOUT_MS, throwOnTimeout: true },
    ndl: { signal, timeoutMs: SEARCH_NDL_TIMEOUT_MS, throwOnTimeout: true },
  };
}
