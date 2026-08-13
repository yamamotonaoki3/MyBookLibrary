/**
 * Issue #479: Aiven MySQL Free 検証用の疎通確認スクリプト。
 * CRUD・トランザクションが正常に動くかを、この検証専用DB上でのみ確認する。
 * 使用後は自分で作成したデータを全て削除する（このスクリプト自身が後始末する）。
 *
 *   cd app && npx dotenv -e .env.aiven-staging -- npx tsx prisma/scripts/verify-aiven-connection.ts
 */
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("[1/5] CREATE: 著者・本を作成");
  const author = await prisma.author.create({
    data: { name: "Aiven検証用_著者" },
  });
  const book = await prisma.book.create({
    data: {
      authorId: author.id,
      title: "Aiven検証用_書籍",
      publishedAt: new Date("2026-01-01"),
      source: "manual",
    },
  });
  console.log(`  author.id=${author.id}, book.id=${book.id}`);

  console.log("[2/5] READ: 作成した本を取得");
  const found = await prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  if (found.title !== "Aiven検証用_書籍") throw new Error("READ検証に失敗しました");

  console.log("[3/5] UPDATE: 本のタイトルを更新");
  const updated = await prisma.book.update({
    where: { id: book.id },
    data: { title: "Aiven検証用_書籍(更新後)" },
  });
  if (updated.title !== "Aiven検証用_書籍(更新後)") throw new Error("UPDATE検証に失敗しました");

  console.log("[4/5] TRANSACTION: トランザクション内で更新しロールバックされることを確認");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: book.id },
        data: { title: "Aiven検証用_書籍(ロールバックされるはず)" },
      });
      throw new Error("INTENTIONAL_ROLLBACK");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "INTENTIONAL_ROLLBACK") throw e;
  }
  const afterRollback = await prisma.book.findUniqueOrThrow({ where: { id: book.id } });
  if (afterRollback.title !== "Aiven検証用_書籍(更新後)") {
    throw new Error("トランザクションのロールバックが機能していません");
  }
  console.log("  ロールバック確認OK（更新前の状態に戻っている）");

  console.log("[5/5] DELETE: 作成したデータを削除（後始末）");
  await prisma.book.delete({ where: { id: book.id } });
  await prisma.author.delete({ where: { id: author.id } });

  const remaining = await prisma.book.count({ where: { title: { startsWith: "Aiven検証用_" } } });
  if (remaining !== 0) throw new Error("後始末に失敗した可能性があります");

  console.log("\n✅ CRUD・トランザクションの検証に成功しました。検証データは削除済みです。");
}

main()
  .catch((err) => {
    console.error("❌ 検証に失敗しました:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
