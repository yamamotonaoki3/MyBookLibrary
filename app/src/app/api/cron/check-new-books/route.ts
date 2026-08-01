import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchBooks } from "@/lib/rakuten";
import { logger } from "@/lib/logger";

// salesDate の形式 "2024年01月" や "2024年01月15日" を Date に変換する
function parseSalesDate(salesDate: string): Date | null {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const day = match[3] ? parseInt(match[3]) : 1;
  return new Date(year, month, day);
}

function isWithinOneWeek(date: Date): boolean {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return date >= oneWeekAgo;
}

const MIN_CRON_SECRET_LENGTH = 16;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    logger.error("CRON_SECRET is not configured or too short");
    return NextResponse.json(
      { error: "Cron secret is not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const favorites = await prisma.favoriteAuthor.findMany({
    where: { notify: true },
    include: { author: true, user: true },
  });

  let createdCount = 0;

  for (const fav of favorites) {
    let books;
    try {
      books = await searchBooks({ author: fav.author.name });
    } catch (err) {
      logger.error({ err, author: fav.author.name }, "楽天API検索エラー");
      continue;
    }

    const newBooks = books.filter((book) => {
      if (!book.isbn) return false;
      const date = parseSalesDate(book.salesDate);
      return date !== null && isWithinOneWeek(date);
    });

    if (newBooks.length === 0) continue;

    // 対象ISBNの既存通知を一括取得
    const newIsbns = newBooks.map((b) => b.isbn as string);
    const existing = await prisma.notification.findMany({
      where: { userId: fav.userId, bookIsbn: { in: newIsbns } },
      select: { bookIsbn: true },
    });
    const existingIsbns = new Set(existing.map((n) => n.bookIsbn));

    // 未通知の新刊のみ一括登録
    const toCreate = newBooks.filter((b) => !existingIsbns.has(b.isbn));
    if (toCreate.length === 0) continue;

    await prisma.notification.createMany({
      data: toCreate.map((book) => ({
        userId: fav.userId,
        type: "new_book",
        content: `${fav.author.name} の新刊「${book.title}」が発売されました`,
        bookIsbn: book.isbn,
      })),
    });
    createdCount += toCreate.length;
  }

  return NextResponse.json({ ok: true, created: createdCount });
}
