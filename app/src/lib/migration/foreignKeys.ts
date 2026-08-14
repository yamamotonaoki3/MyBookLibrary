/**
 * schema.prisma（`app/prisma/schema.prisma`）に定義された全外部キーの一覧。
 * dump restore後のorphan（親レコード不在）検査（照合ツール）で使用する。
 */

export interface ForeignKeyDefinition {
  /** 子テーブル名（DB列名） */
  tableName: string;
  /** 参照元の列名 */
  columnName: string;
  /** 参照先テーブル名 */
  referencedTableName: string;
  /** 参照先の列名 */
  referencedColumnName: string;
  /** NULL許容な外部キー列か（NULLはorphan検査の対象外にする） */
  nullable: boolean;
}

export const FOREIGN_KEYS: ForeignKeyDefinition[] = [
  { tableName: "user_libraries", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "accounts", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "sessions", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "books", columnName: "author_id", referencedTableName: "authors", referencedColumnName: "id", nullable: false },
  { tableName: "books", columnName: "created_by_user_id", referencedTableName: "users", referencedColumnName: "id", nullable: true },
  { tableName: "award_entries", columnName: "book_id", referencedTableName: "books", referencedColumnName: "id", nullable: false },
  { tableName: "award_entries", columnName: "award_id", referencedTableName: "awards", referencedColumnName: "id", nullable: false },
  { tableName: "favorite_authors", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "favorite_authors", columnName: "author_id", referencedTableName: "authors", referencedColumnName: "id", nullable: false },
  { tableName: "reading_statuses", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "reading_statuses", columnName: "book_id", referencedTableName: "books", referencedColumnName: "id", nullable: false },
  { tableName: "reviews", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "reviews", columnName: "book_id", referencedTableName: "books", referencedColumnName: "id", nullable: false },
  { tableName: "likes", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "likes", columnName: "review_id", referencedTableName: "reviews", referencedColumnName: "id", nullable: false },
  { tableName: "reports", columnName: "review_id", referencedTableName: "reviews", referencedColumnName: "id", nullable: false },
  { tableName: "reports", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "notifications", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "notifications", columnName: "actor_id", referencedTableName: "users", referencedColumnName: "id", nullable: true },
  { tableName: "follows", columnName: "follower_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "follows", columnName: "following_id", referencedTableName: "users", referencedColumnName: "id", nullable: false },
  { tableName: "contact_inquiries", columnName: "user_id", referencedTableName: "users", referencedColumnName: "id", nullable: true },
  { tableName: "audit_logs", columnName: "actor_user_id", referencedTableName: "users", referencedColumnName: "id", nullable: true },
];

function quoteColumn(column: string): string {
  return `\`${column}\``;
}

function quoteTable(table: string): string {
  return `\`${table}\``;
}

/**
 * 親レコードが存在しない行（orphan）を検出するSQLを組み立てる。
 * NULL許容な外部キー列は、NULL自体を「未設定」として許容するため
 * `WHERE <子列> IS NOT NULL` を必ず付与し、NULL行を誤検出しないようにする。
 */
export function buildOrphanQuery(fk: ForeignKeyDefinition): string {
  const child = quoteTable(fk.tableName);
  const parent = quoteTable(fk.referencedTableName);
  const childColumn = quoteColumn(fk.columnName);
  const parentColumn = quoteColumn(fk.referencedColumnName);

  const notNullClause = fk.nullable ? ` AND c.${childColumn} IS NOT NULL` : "";

  return (
    `SELECT c.${childColumn} AS orphan_value, COUNT(*) AS orphan_count\n` +
    `FROM ${child} c\n` +
    `LEFT JOIN ${parent} p ON c.${childColumn} = p.${parentColumn}\n` +
    `WHERE p.${parentColumn} IS NULL${notNullClause}\n` +
    `GROUP BY c.${childColumn}`
  );
}
