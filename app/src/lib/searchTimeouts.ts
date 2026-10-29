// #634 USER_FACING_RESOLVE_OPTIONS と同じ外部API上限。
// 検索は楽天→NDLの順に呼ぶため全体8秒、ブラウザは通信の余裕を含め15秒。
export const SEARCH_RAKUTEN_TIMEOUT_MS = 3000;
export const SEARCH_RAKUTEN_TOTAL_TIMEOUT_MS = 5000;
export const SEARCH_NDL_TIMEOUT_MS = 4000;
export const SEARCH_BUDGET_MS = 8000;
export const SEARCH_CLIENT_TIMEOUT_MS = 15000;
