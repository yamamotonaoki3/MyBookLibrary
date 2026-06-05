import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";
import { searchBooks } from "../src/lib/rakuten";

const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("書影データの取得を開始します...");

  const books = await prisma.book.findMany({
    where: { coverImageUrl: null },
    select: { id: true, title: true },
  });

  console.log(`対象書籍: ${books.length}件`);

  for (const book of books) {
    console.log(`\n検索中: 「${book.title}」`);

    const items = await searchBooks({ title: book.title });
    const result = items[0] ?? null;

    if (!result) {
      console.log(`  → 見つかりませんでした`);
    } else {
      await prisma.book.update({
        where: { id: book.id },
        data: { coverImageUrl: result.largeImageUrl },
      });
      console.log(`  → 書影URL取得: ${result.largeImageUrl}`);
    }

    // QPSが1のため1秒待機
    await sleep(1100);
  }

  console.log("\n書影データの取得が完了しました！");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
