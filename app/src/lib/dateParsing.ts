/**
 * 楽天ブックスAPI等の "2024年01月" "2024年01月15日" 形式の発売日文字列を
 * Book.publishedAt（DATE列）に保存できる UTC 日付の Date に変換する。
 * DATE列にUTC日付として保存されるため、ローカルタイムゾーンで生成すると1日ずれる。
 * マッチしない場合は null を返す（呼び出し側でフォールバック挙動を明示する）。
 */
export function parseSalesDateToUtcDate(
  raw: string | null | undefined,
  opts?: { allowIsoFallback?: boolean }
): Date | null {
  if (!raw) return null;

  const match = raw.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const day = match[3] ? parseInt(match[3]) : 1;
    return new Date(Date.UTC(year, month, day));
  }

  if (opts?.allowIsoFallback) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}
