import { normalizeAuthor, normalizeTitle } from "@/lib/rakuten";

export type MatchCandidate = { title: string; author: string };

/**
 * 外部API検索結果が問い合わせ対象と同一作品とみなせるかを判定する。
 * 著者名は完全一致を必須とし（表記ゆれはnormalizeAuthorで吸収）、
 * タイトルは完全一致または一方が他方を包含する場合のみ許容する。
 * 著者一致のみでタイトルが別作品の候補を採用すると、
 * 異なる本へ同一ISBNを書き込みDBのUnique制約違反を引き起こすため、両方の一致を要求する。
 */
export function isPlausibleMatch(candidate: MatchCandidate, target: MatchCandidate): boolean {
  if (normalizeAuthor(candidate.author) !== normalizeAuthor(target.author)) return false;

  const candidateTitle = normalizeTitle(candidate.title);
  const targetTitle = normalizeTitle(target.title);
  if (!candidateTitle || !targetTitle) return false;

  return (
    candidateTitle === targetTitle ||
    candidateTitle.includes(targetTitle) ||
    targetTitle.includes(candidateTitle)
  );
}
