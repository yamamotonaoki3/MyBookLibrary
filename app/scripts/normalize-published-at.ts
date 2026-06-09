/**
 * 同タイトル・同著者の全Bookレコードの publishedAt を最古の値に統一する。
 *
 * 実行方法:
 *   cd app && npx tsx scripts/normalize-published-at.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const books = await prisma.book.findMany({
    select: { id: true, title: true, authorId: true, publishedAt: true },
    orderBy: { publishedAt: "asc" },
  });

  const groups = new Map<string, typeof books>();
  for (const book of books) {
    const key = `${book.authorId}::${book.title}`;
    const group = groups.get(key) ?? [];
    group.push(book);
    groups.set(key, group);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`重複タイトルのグループ数: ${duplicateGroups.length}`);

  let updated = 0;
  for (const group of duplicateGroups) {
    const oldest = group.reduce(
      (min, b) => (b.publishedAt < min ? b.publishedAt : min),
      group[0].publishedAt
    );
    const oldestStr = oldest.toISOString().slice(0, 10);

    for (const book of group) {
      const current = book.publishedAt.toISOString().slice(0, 10);
      if (current !== oldestStr) {
        await prisma.book.update({
          where: { id: book.id },
          data: { publishedAt: oldest },
        });
        console.log(`✓ [id=${book.id}] "${book.title}": ${current} → ${oldestStr}`);
        updated++;
      } else {
        console.log(`- [id=${book.id}] "${book.title}": ${current}（変更なし）`);
      }
    }
  }

  console.log(`\n完了: 更新=${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
