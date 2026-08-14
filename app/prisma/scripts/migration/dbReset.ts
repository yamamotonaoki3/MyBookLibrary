/**
 * 移行先DBを「テーブルが1つも存在しない状態」へ初期化する。
 *
 * docs/data-migration-spec-481.md の必須前提条件:
 *   dump復元前に、移行先DBを完全に空の状態にする（_prisma_migrations・follows・
 *   audit_logs を含む全テーブルをDROPする。TRUNCATEやアプリケーションテーブルのみの
 *   DROPでは要件を満たさない）。
 */
import type { PrismaClient } from "@/generated/prisma";

interface TableNameRow {
  TABLE_NAME: string;
}

/**
 * 現在のデータベース内の全テーブルをDROPする。
 * 戻り値はDROPしたテーブル名一覧（ログ表示・検証用）。
 */
export async function resetTargetDatabase(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<TableNameRow[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
  );
  const tableNames = rows.map((row) => row.TABLE_NAME);

  if (tableNames.length === 0) {
    return [];
  }

  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
  try {
    for (const tableName of tableNames) {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${tableName}\``);
    }
  } finally {
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  }

  return tableNames;
}

/** リセット後、本当にテーブルが0件であることを確認する（安全確認用）。 */
export async function assertDatabaseIsEmpty(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<TableNameRow[]>(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
  );
  if (rows.length > 0) {
    throw new Error(
      `移行先DBの初期化後もテーブルが残っています: ${rows.map((r) => r.TABLE_NAME).join(", ")}`
    );
  }
}
