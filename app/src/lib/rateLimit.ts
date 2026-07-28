// 無限スクロール等による連続リクエストから外部API呼び出しを守るための
// 簡易レート制限。キーごとに直近許可時刻を保持し、一定間隔未満のリクエストを弾く。
// インメモリのため単一インスタンス運用が前提。複数インスタンスにスケールする
// 場合はRedis等の共有ストアに置き換える必要がある。
const lastAllowedAtByKey = new Map<string, number>();

export function isRateLimited(key: string, intervalMs: number): boolean {
  const now = Date.now();
  const lastAt = lastAllowedAtByKey.get(key);
  if (lastAt !== undefined && now - lastAt < intervalMs) {
    return true;
  }
  lastAllowedAtByKey.set(key, now);

  // 呼び出しのついでに、十分古くなったエントリを間引いてMapが際限なく
  // 増え続けないようにする（アクセスが途絶えたユーザー分のエントリは
  // 二度と参照されず、そのまま放置するとプロセス生存中ずっと残り続けるため）
  const staleThreshold = intervalMs * 10;
  for (const [k, at] of lastAllowedAtByKey) {
    if (now - at > staleThreshold) {
      lastAllowedAtByKey.delete(k);
    }
  }

  return false;
}

/** テスト用：モジュールスコープの状態をリセットする */
export function resetRateLimits(): void {
  lastAllowedAtByKey.clear();
}
