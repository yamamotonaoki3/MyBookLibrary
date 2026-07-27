import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type RecommendedAuthor = {
  authorId: number;
  name: string;
  score: number;
};

type RecommendedAuthorRow = {
  authorId: number;
  name: string;
  // MySQLのDECIMAL演算結果は $queryRaw で number/string/Prisma.Decimal のいずれかで返りうる
  score: number | string | Prisma.Decimal;
};

function toNumberScore(score: RecommendedAuthorRow["score"]): number {
  if (typeof score === "number") return score;
  if (typeof score === "string") return Number(score);
  return score.toNumber();
}

/**
 * userId がお気に入り登録している著者と、他ユーザーの共起データをもとに
 * 未登録の著者を著者単位の協調フィルタリング（Jaccard係数）でおすすめする。
 *
 * Jaccard係数は著者ペア (A, B) ごとに定義する:
 *   score(A, B) = 共起ユーザー数 / (Aの登録者数 + Bの登録者数 - 共起ユーザー数)
 * 自分が複数の著者を登録している場合、候補著者ごとのスコアは
 * 最も強く似ている1人分（MAX）を採用する。
 */
export async function getRecommendedAuthors(
  userId: number,
  limit = 5
): Promise<RecommendedAuthor[]> {
  const rows = await prisma.$queryRaw<RecommendedAuthorRow[]>`
    WITH my_authors AS (
      SELECT author_id FROM favorite_authors WHERE user_id = ${userId}
    ),
    author_counts AS (
      SELECT author_id, COUNT(DISTINCT user_id) AS cnt
      FROM favorite_authors
      GROUP BY author_id
    ),
    co_occurrence AS (
      SELECT
        fa1.author_id AS author_a,
        fa2.author_id AS author_b,
        COUNT(DISTINCT fa1.user_id) AS co_cnt
      FROM favorite_authors fa1
      JOIN favorite_authors fa2
        ON fa1.user_id = fa2.user_id
       AND fa1.author_id <> fa2.author_id
      WHERE fa1.user_id <> ${userId}
        AND fa1.author_id IN (SELECT author_id FROM my_authors)
        AND fa2.author_id NOT IN (SELECT author_id FROM my_authors)
      GROUP BY fa1.author_id, fa2.author_id
    )
    SELECT
      co.author_b AS authorId,
      a.name AS name,
      MAX(co.co_cnt / (ac_a.cnt + ac_b.cnt - co.co_cnt)) AS score
    FROM co_occurrence co
    JOIN author_counts ac_a ON ac_a.author_id = co.author_a
    JOIN author_counts ac_b ON ac_b.author_id = co.author_b
    JOIN authors a ON a.id = co.author_b
    GROUP BY co.author_b, a.name
    ORDER BY score DESC, co.author_b ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    authorId: row.authorId,
    name: row.name,
    score: toNumberScore(row.score),
  }));
}
