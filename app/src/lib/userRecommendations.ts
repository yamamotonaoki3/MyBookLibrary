import { prisma } from "@/lib/prisma";

export type RecommendedUser = {
  userId: number;
  name: string;
  commonAuthorCount: number;
  commonAuthorNames: string[];
};

type RecommendedUserRow = {
  userId: number;
  name: string;
  // COUNT(DISTINCT ...) は $queryRaw で bigint 文字列として返ることがある
  commonAuthorCount: number | string | bigint;
  // GROUP_CONCAT の結果。区切り文字 "|" で分割して使う
  commonAuthorNames: string;
};

function toNumberCount(count: RecommendedUserRow["commonAuthorCount"]): number {
  if (typeof count === "number") return count;
  return Number(count);
}

const DISPLAY_AUTHOR_NAMES_LIMIT = 3;

/**
 * userId がお気に入り登録している著者と同じ著者を登録している他ユーザーを、
 * 共通著者数の多い順にフォロー候補としておすすめする。
 *
 * スコアは共通著者数の単純カウント（Jaccard係数ではない）。
 * 除外対象は自分自身と、既にフォロー中のユーザーのみ。
 * まだフォローバックしていないフォロワーは候補に含める。
 */
export async function getRecommendedUsers(
  userId: number,
  limit = 5
): Promise<RecommendedUser[]> {
  const rows = await prisma.$queryRaw<RecommendedUserRow[]>`
    WITH my_authors AS (
      SELECT author_id FROM favorite_authors WHERE user_id = ${userId}
    ),
    already_following AS (
      SELECT following_id FROM follows WHERE follower_id = ${userId}
    ),
    candidates AS (
      SELECT
        fa2.user_id AS candidate_user_id,
        fa2.author_id AS author_id
      FROM favorite_authors fa1
      JOIN favorite_authors fa2
        ON fa1.author_id = fa2.author_id
       AND fa1.user_id <> fa2.user_id
      WHERE fa1.user_id = ${userId}
        AND fa2.user_id <> ${userId}
        AND fa2.user_id NOT IN (SELECT following_id FROM already_following)
    )
    SELECT
      c.candidate_user_id AS userId,
      u.name AS name,
      COUNT(DISTINCT c.author_id) AS commonAuthorCount,
      GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR '|') AS commonAuthorNames
    FROM candidates c
    JOIN users u ON u.id = c.candidate_user_id
    JOIN authors a ON a.id = c.author_id
    GROUP BY c.candidate_user_id, u.name
    ORDER BY commonAuthorCount DESC, userId ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => {
    const allNames = row.commonAuthorNames ? row.commonAuthorNames.split("|") : [];
    return {
      userId: row.userId,
      name: row.name,
      commonAuthorCount: toNumberCount(row.commonAuthorCount),
      commonAuthorNames: allNames.slice(0, DISPLAY_AUTHOR_NAMES_LIMIT),
    };
  });
}
