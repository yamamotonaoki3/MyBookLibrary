/**
 * schema.prisma（`app/prisma/schema.prisma`）に定義された全UNIQUE制約の一覧。
 * dump restore後の重複検査（照合ツール）で使用する。
 *
 * 移行方式（docs/data-migration-spec-481.md）上、6件の未反映migrationは
 * 新規UNIQUE制約を既存データへ追加するものを含まないため、理論上は重複は
 * 発生しない前提だが、念のため実測で検査する。
 */

export interface UniqueConstraint {
  /** DBのテーブル名（@@mapで指定されたスネークケース名） */
  tableName: string;
  /** DBの列名（複合UNIQUEの場合は複数） */
  columns: string[];
  /**
   * 列のいずれかがNULL許容か。MySQLのUNIQUE制約はNULL同士を重複とみなさないため、
   * true の場合は重複検査クエリに `WHERE <列> IS NOT NULL` を必須で加える。
   */
  nullableColumns: string[];
}

export const UNIQUE_CONSTRAINTS: UniqueConstraint[] = [
  { tableName: "users", columns: ["email"], nullableColumns: [] },
  { tableName: "books", columns: ["isbn"], nullableColumns: ["isbn"] },
  { tableName: "awards", columns: ["name"], nullableColumns: [] },
  {
    tableName: "award_entries",
    columns: ["book_id", "award_id", "year"],
    nullableColumns: [],
  },
  {
    tableName: "favorite_authors",
    columns: ["user_id", "author_id"],
    nullableColumns: [],
  },
  {
    tableName: "reading_statuses",
    columns: ["user_id", "book_id"],
    nullableColumns: [],
  },
  { tableName: "likes", columns: ["user_id", "review_id"], nullableColumns: [] },
  { tableName: "reports", columns: ["user_id", "review_id"], nullableColumns: [] },
  {
    tableName: "notifications",
    columns: ["user_id", "type", "book_isbn"],
    nullableColumns: ["book_isbn"],
  },
  {
    tableName: "user_libraries",
    columns: ["user_id", "systemid", "libkey"],
    nullableColumns: [],
  },
  {
    tableName: "accounts",
    columns: ["provider", "provider_account_id"],
    nullableColumns: [],
  },
  { tableName: "sessions", columns: ["session_token"], nullableColumns: [] },
  { tableName: "verification_tokens", columns: ["token"], nullableColumns: [] },
  {
    tableName: "verification_tokens",
    columns: ["identifier", "token"],
    nullableColumns: [],
  },
  {
    tableName: "follows",
    columns: ["follower_id", "following_id"],
    nullableColumns: [],
  },
];

function quoteColumn(column: string): string {
  return `\`${column}\``;
}

function quoteTable(table: string): string {
  return `\`${table}\``;
}

/**
 * 指定したUNIQUE制約の重複行を検出するSQLを組み立てる。
 * NULL許容列を含む制約には、`WHERE <列> IS NOT NULL` を必ず付与する
 * （NULL同士は重複とみなされないため、付与しないと誤検出する）。
 */
export function buildUniqueDuplicateQuery(constraint: UniqueConstraint): string {
  const columnList = constraint.columns.map(quoteColumn).join(", ");
  const table = quoteTable(constraint.tableName);

  const whereClause =
    constraint.nullableColumns.length > 0
      ? `WHERE ${constraint.nullableColumns
          .map((column) => `${quoteColumn(column)} IS NOT NULL`)
          .join(" AND ")}\n`
      : "";

  return (
    `SELECT ${columnList}, COUNT(*) AS duplicate_count\n` +
    `FROM ${table}\n` +
    whereClause +
    `GROUP BY ${columnList}\n` +
    `HAVING COUNT(*) > 1`
  );
}
