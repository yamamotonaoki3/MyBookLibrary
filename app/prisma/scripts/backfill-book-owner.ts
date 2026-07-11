/**
 * 移行前に作成された手動登録本(source="manual", createdByUserId=null)について、
 * その本に対する最古のReadingStatusのユーザーを登録者とみなしてcreatedByUserIdを設定する。
 *
 * 自動実行はしない。必要な場合のみ管理者が手動で実行する。
 *   cd app && npx tsx prisma/scripts/backfill-book-owner.ts
 */
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.book.findMany({
    where: { source: "manual", createdByUserId: null },
    select: { id: true },
  });

  let updated = 0;
  for (const book of targets) {
    const earliestStatus = await prisma.readingStatus.findFirst({
      where: { bookId: book.id },
      orderBy: { id: "asc" },
    });
    if (!earliestStatus) continue;

    await prisma.book.update({
      where: { id: book.id },
      data: { createdByUserId: earliestStatus.userId },
    });
    updated++;
  }

  console.log(`対象 ${targets.length} 件中 ${updated} 件を更新しました。`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
