/**
 * 既存Bookレコードの publishedAt を楽天ブックスAPIから取得した正しい出版日で上書きする。
 * 著者名で検索し全作品を取得、タイトル一致する版の中から最古の salesDate を使用する。
 * （お気に入り著者作品一覧の deduplicateByTitle と同じロジック）
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

function parseSalesDateMs(salesDate: string): number {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return Infinity;
  const [, year, month, day = "01"] = match;
  return new Date(`${year}-${month}-${day}`).getTime();
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, "").normalize("NFKC");
}

// 著者名で全作品を取得し、タイトル一致する版の最古 salesDate を返す
// （著者作品一覧ページと同じ検索方法）
async function fetchOldestSalesDateByAuthor(
  authorName: string,
  title: string
): Promise<string | null> {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) throw new Error("RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が未設定です");

  const normalizedTarget = normalizeTitle(title);
  let page = 1;
  let pageCount = 1;
  let oldest: { salesDate: string } | null = null;

  while (page <= Math.min(pageCount, 5)) {
    const url = new URL(RAKUTEN_API_BASE);
    url.searchParams.set("applicationId", appId);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("formatVersion", "2");
    url.searchParams.set("author", authorName);
    url.searchParams.set("hits", "30");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`  楽天API エラー: ${res.status} (author=${authorName}, page=${page})`);
      break;
    }

    const data = await res.json();
    pageCount = data.pageCount ?? 1;
    const items = (data.Items ?? []) as Array<{ title: string; salesDate: string }>;

    for (const item of items) {
      if (normalizeTitle(item.title) !== normalizedTarget) continue;
      if (!oldest || parseSalesDateMs(item.salesDate) < parseSalesDateMs(oldest.salesDate)) {
        oldest = item;
      }
    }

    page++;
    if (page <= Math.min(pageCount, 5)) {
      await sleep(500);
    }
  }

  return oldest?.salesDate ?? null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const books = await prisma.book.findMany({
    include: { author: true },
    orderBy: { id: "asc" },
  });

  console.log(`対象レコード数: ${books.length}`);
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of books) {
    const salesDate = await fetchOldestSalesDateByAuthor(book.author.name, book.title);

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

    if (before === after) {
      console.log(`- [id=${book.id}] "${book.title}": ${before}（変更なし）`);
      skipped++;
      await sleep(1500);
      continue;
    }

    await prisma.book.update({
      where: { id: book.id },
      data: { publishedAt: newDate },
    });
    console.log(`✓ [id=${book.id}] "${book.title}": ${before} → ${after}`);
    updated++;

    await sleep(1500);
  }

  console.log(`\n完了: 更新=${updated}, 変更なし=${skipped}, 失敗/未取得=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
