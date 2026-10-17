/**
 * MySQL → D1 のデータ移行（ETL）の対象テーブルと、変換の定義（docs/archive/cloudflare-d1-migration-plan.md §7）。
 * 移行ツールと照合ツールの両方がここを参照する（変換の定義を 1 か所に置き、検証側で「期待される変換」を共有するため）。
 */
import { normalizeEmail } from "@/lib/email";

export type Row = Record<string, unknown>;

export type TableSpec = {
  /** Prisma クライアントのモデル名（`prisma.<model>`）。 */
  model: string;
  /** 実テーブル名（表示用）。 */
  table: string;
  /** 読み出しの並び順（照合キー）。主キー、主キーのない表は一意キー。移行・照合の双方で同じ順序を使う。 */
  orderBy: string[];
  /** 移行時に値を変換する列と、その変換。照合では、変換後の移行元の値と D1 の値を比較する。 */
  transform?: (row: Row) => Row;
  /**
   * Json 型の列。Prisma は、Json 列への `null` の書き込みを受け付けず、DB の NULL は `Prisma.DbNull` で指定する必要がある。
   * 一覧が実スキーマと一致することは、テストで Prisma のスキーマから検査する。
   */
  jsonColumns?: string[];
};

/** 移行時に変換する列の説明（レポート用）。 */
export const TRANSFORMED_COLUMNS: Record<string, string[]> = {
  users: ["email（小文字化・前後の空白除去）"],
};

/**
 * 移行の順序。外部キーの親 → 子。この順序で投入し、逆順で削除する（順序の妥当性は、テストで Prisma のスキーマから検査する）。
 */
export const MIGRATION_TABLES: TableSpec[] = [
  {
    model: "user",
    table: "users",
    orderBy: ["id"],
    transform: (row) => ({ ...row, email: normalizeEmail(String(row.email)) }),
  },
  { model: "author", table: "authors", orderBy: ["id"] },
  { model: "award", table: "awards", orderBy: ["id"] },
  { model: "book", table: "books", orderBy: ["id"] },
  { model: "bookIsbn", table: "book_isbns", orderBy: ["id"] },
  { model: "awardEntry", table: "award_entries", orderBy: ["id"] },
  { model: "account", table: "accounts", orderBy: ["id"] },
  { model: "session", table: "sessions", orderBy: ["id"] },
  { model: "verificationToken", table: "verification_tokens", orderBy: ["identifier", "token"] },
  { model: "userLibrary", table: "user_libraries", orderBy: ["id"] },
  { model: "favoriteAuthor", table: "favorite_authors", orderBy: ["id"] },
  { model: "follow", table: "follows", orderBy: ["id"] },
  { model: "readingStatus", table: "reading_statuses", orderBy: ["id"] },
  { model: "review", table: "reviews", orderBy: ["id"] },
  { model: "like", table: "likes", orderBy: ["id"] },
  { model: "report", table: "reports", orderBy: ["id"] },
  { model: "notification", table: "notifications", orderBy: ["id"] },
  { model: "contactInquiry", table: "contact_inquiries", orderBy: ["id"] },
  { model: "auditLog", table: "audit_logs", orderBy: ["id"], jsonColumns: ["detail"] },
  { model: "bookEnrichmentJob", table: "book_enrichment_jobs", orderBy: ["id"] },
  { model: "bookEnrichmentItem", table: "book_enrichment_items", orderBy: ["id"], jsonColumns: ["resultDetail"] },
];

/**
 * デモ環境（#719）に投入するマスターデータ。賞・著者・本・ISBN・受賞。ユーザー関連のテーブルは含めない。
 * 本の「登録者」（ユーザーへの参照）は、本番のユーザーとの対応を残さないよう空にする。
 */
export const DEMO_MASTER_TABLES: TableSpec[] = ["author", "award", "book", "bookIsbn", "awardEntry"].map((model) => {
  const spec = MIGRATION_TABLES.find((table) => table.model === model)!;
  return model === "book" ? { ...spec, transform: (row: Row) => ({ ...row, createdByUserId: null }) } : spec;
});

export function applyTransform(spec: TableSpec, row: Row): Row {
  return spec.transform ? spec.transform(row) : row;
}
