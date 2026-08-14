/**
 * 本番dump（12件のmigration適用済み時点）に含まれるべきテーブル名の一覧。
 * `_prisma_migrations` と16のアプリケーションテーブルのみで、`follows`・`audit_logs`
 * （6件の未反映migrationで新設される）は含まれない。
 *
 * restore-to-target.ts が、DB初期化（DROP）を実行する前に、渡されたdumpがこの
 * テーブル構成と過不足なく一致することを確認するために使う（空dump・不完全なdumpを
 * 誤ってそのまま復元してしまう事故を防ぐ）。
 */
export const EXPECTED_DUMP_TABLES: readonly string[] = [
  "_prisma_migrations",
  "users",
  "user_libraries",
  "accounts",
  "sessions",
  "verification_tokens",
  "authors",
  "books",
  "awards",
  "award_entries",
  "favorite_authors",
  "reading_statuses",
  "reviews",
  "likes",
  "reports",
  "notifications",
  "contact_inquiries",
];

export interface DumpTableSetValidation {
  valid: boolean;
  missingTables: string[];
  unexpectedTables: string[];
}

/**
 * dumpに含まれるテーブル名一覧（parseDumpの結果から抽出したtableName一覧）が、
 * EXPECTED_DUMP_TABLESと過不足なく一致するかを検証する。
 */
export function validateDumpTableSet(actualTableNames: string[]): DumpTableSetValidation {
  const expectedSet = new Set(EXPECTED_DUMP_TABLES);
  const actualSet = new Set(actualTableNames);

  const missingTables = EXPECTED_DUMP_TABLES.filter((table) => !actualSet.has(table));
  const unexpectedTables = actualTableNames.filter((table) => !expectedSet.has(table));

  return {
    valid: missingTables.length === 0 && unexpectedTables.length === 0,
    missingTables,
    unexpectedTables,
  };
}
