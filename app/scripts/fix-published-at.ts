/**
 * 既存Bookレコードの publishedAt を楽天ブックスAPIから取得した正しい出版日で上書きする。
 * ISBNがない本はスキップ。
 *
 * 実行方法:
 *   cd app && npx tsx scripts/fix-published-at.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const RAKUTEN_API_BASE =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";

function parseSalesDate(salesDate: string): Date | null {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = match[3] ? parseInt(match[3]) : 1;
  return new Date(year, month, day);
}

async function fetchSalesDateByIsbn(isbn: string): Promise<string | null> {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) throw new Error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が未設定です");

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`  楽天API エラー: ${res.status} (isbn=${isbn})`);
    return null;
  }

  const data = await res.json();
  const items = (data.Items ?? []) as Array<{ salesDate: string }>;
  return items[0]?.salesDate ?? null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // publishedAt が 2026年6月（new Date() で誤登録された値）の本だけを対象にする
  const books = await prisma.book.findMany({
    where: {
      isbn: { not: null },
      publishedAt: {
        gte: new Date("2026-06-01"),
        lt: new Date("2026-07-01"),
      },
    },
    select: { id: true, title: true, isbn: true, publishedAt: true },
  });

  console.log(`対象レコード数（2026年6月に誤登録されたもの）: ${books.length}`);
  let updated = 0;
  const skipped = 0;
  let failed = 0;

  for (const book of books) {
    const salesDate = await fetchSalesDateByIsbn(book.isbn!);
    if (!salesDate) {
      console.log(`- [id=${book.id}] "${book.title}" → 楽天APIで見つからず、スキップ`);
      failed++;
      await sleep(1500);
      continue;
    }

    const newDate = parseSalesDate(salesDate);
    if (!newDate) {
      console.log(`- [id=${book.id}] "${book.title}" → salesDate "${salesDate}" をパースできず、スキップ`);
      failed++;
      await sleep(1500);
      continue;
    }

    const before = book.publishedAt.toISOString().slice(0, 10);
    const after = newDate.toISOString().slice(0, 10);
    await prisma.book.update({
      where: { id: book.id },
      data: { publishedAt: newDate },
    });
    console.log(`✓ [id=${book.id}] "${book.title}": ${before} → ${after}`);
    updated++;

    await sleep(1500);
  }

  console.log(`\n完了: 更新=${updated}, スキップ=${skipped}, 失敗/未取得=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
