/**
 * Issue #479: Aiven MySQL Free の状態確認（テーブル一覧・接続数）。
 * 読み取り専用。
 *
 *   cd app && npx dotenv -e .env.aiven-staging -o -- npx tsx prisma/scripts/check-aiven-status.ts
 */
import { PrismaClient } from "@/generated/prisma";
import { assertAivenDatabaseUrl } from "./aivenDbGuard";

const prisma = new PrismaClient();

async function main() {
  assertAivenDatabaseUrl(process.env.DATABASE_URL, process.env.AIVEN_STAGING_HOST);

  const tables = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    `SELECT table_name AS TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;`
  );
  console.log(`テーブル数: ${tables.length}`);
  console.log(tables.map((t) => t.TABLE_NAME).join(", "));

  const threads = await prisma.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>(
    `SHOW STATUS LIKE 'Threads_connected';`
  );
  const maxConn = await prisma.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>(
    `SHOW VARIABLES LIKE 'max_connections';`
  );
  console.log(`現在の接続数(このプロセス含む): ${threads[0]?.Value}`);
  console.log(`max_connections: ${maxConn[0]?.Value}`);
}

main()
  .catch((err) => {
    console.error("❌ 確認に失敗しました:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
