/**
 * 本番RDS専用の読み取り監査。値・本文・メールアドレスを出力せず、集計だけを表示する。
 * 実行前に DATABASE_URL のホストと PRODUCTION_DB_HOST の完全一致を必ず確認する。
 */
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

const tables = [
  "users", "user_libraries", "accounts", "sessions", "verification_tokens", "books", "book_isbns", "authors", "awards", "award_entries",
  "reading_statuses", "reviews", "likes", "reports", "notifications", "follows",
  "favorite_authors", "contact_inquiries", "audit_logs", "book_enrichment_jobs", "book_enrichment_items",
] as const;

function databaseHost(url: string): string {
  return new URL(url).hostname;
}

function assertProductionTarget(): void {
  const actual = process.env.DATABASE_URL;
  const expected = process.env.PRODUCTION_DB_HOST;
  if (!actual || !expected || databaseHost(actual) !== expected) {
    throw new Error("本番RDSホストの照合に失敗したため、読み取り監査を停止しました。");
  }
}

async function scalar(sql: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(sql);
  return Number(result[0]?.value ?? 0);
}

async function main(): Promise<void> {
  assertProductionTarget();
  const tableCounts = Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await scalar(`SELECT COUNT(*) AS value FROM \`${table}\``)]))
  );
  const maxIds = Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await scalar(`SELECT COALESCE(MAX(id), 0) AS value FROM \`${table}\``)]))
  );
  const autoIncrement = await prisma.$queryRawUnsafe<Array<{ table_name: string; auto_increment: bigint | null }>>(
    "SELECT table_name, auto_increment FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('users','user_libraries','accounts','sessions','verification_tokens','books','book_isbns','authors','awards','award_entries','reading_statuses','reviews','likes','reports','notifications','follows','favorite_authors','contact_inquiries','audit_logs','book_enrichment_jobs','book_enrichment_items')"
  );
  const foreignKeyOrphans = await scalar(
    "SELECT (SELECT COUNT(*) FROM reading_statuses rs LEFT JOIN users u ON u.id=rs.user_id WHERE u.id IS NULL) + (SELECT COUNT(*) FROM reading_statuses rs LEFT JOIN books b ON b.id=rs.book_id WHERE b.id IS NULL) + (SELECT COUNT(*) FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE u.id IS NULL) + (SELECT COUNT(*) FROM reviews r LEFT JOIN books b ON b.id=r.book_id WHERE b.id IS NULL) AS value"
  );
  const uniqueViolations = await scalar(
    "SELECT (SELECT COUNT(*) FROM (SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1) x) + (SELECT COUNT(*) FROM (SELECT isbn FROM book_isbns GROUP BY isbn HAVING COUNT(*) > 1) x) AS value"
  );
  const manualBooks = await prisma.book.groupBy({ by: ["createdByUserId"], where: { source: "manual" }, _count: { _all: true } });
  const manual = {
    total: manualBooks.reduce((sum, item) => sum + item._count._all, 0),
    ownerMissing: manualBooks.filter((item) => item.createdByUserId === null).reduce((sum, item) => sum + item._count._all, 0),
  };
  const migration = {
    applied: await scalar("SELECT COUNT(*) AS value FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"),
    failedOrRolledBack: await scalar("SELECT COUNT(*) AS value FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"),
  };
  console.log(JSON.stringify({
    mode: "read-only-production-audit",
    result: foreignKeyOrphans === 0 && uniqueViolations === 0 ? "PASS" : "FAIL",
    tableCounts, maxIds,
    autoIncrement: Object.fromEntries(autoIncrement.map((item) => [item.table_name, Number(item.auto_increment ?? 0)])),
    migration, foreignKeyOrphans, uniqueViolations, manual,
  }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "監査に失敗しました。");
    await prisma.$disconnect();
    process.exit(1);
  });
