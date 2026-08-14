/**
 * 移行・照合ツール（restore-to-target.ts / verify-migration.ts）共通の接続先ガード。
 * 実際の判定ロジックは `src/lib/migration/migrationGuard.ts` を参照。
 *
 * 必要な環境変数:
 *   - DATABASE_URL: 接続先（移行先DB）
 *   - MIGRATION_TARGET_ALLOWED_HOSTS: 移行先として許可するホスト名（カンマ区切り）
 *   - PRODUCTION_DB_HOST: 本番DBホスト名（比較専用。この値で実際に接続することはない）
 */
import { assertMigrationTargetAllowed } from "@/lib/migration/migrationGuard";

export function assertMigrationTargetDatabaseUrl(): void {
  assertMigrationTargetAllowed({
    databaseUrl: process.env.DATABASE_URL,
    allowedHostsCsv: process.env.MIGRATION_TARGET_ALLOWED_HOSTS,
    productionHost: process.env.PRODUCTION_DB_HOST,
  });
}
