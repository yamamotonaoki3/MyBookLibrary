import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchBooks } from "@/lib/rakuten";
import { logger } from "@/lib/logger";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";

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
      const date = parseSalesDateToUtcDate(book.salesDate);
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

    const nowInJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = new Date(
      Date.UTC(
        nowInJst.getUTCFullYear(),
        nowInJst.getUTCMonth(),
        nowInJst.getUTCDate(),
      ),
    );

    await prisma.notification.createMany({
      data: toCreate.map((book) => {
        const salesDate = parseSalesDateToUtcDate(book.salesDate);
        const releaseMessage =
          salesDate !== null && salesDate > today
            ? "が発売予定です"
            : "が発売されました";

        return {
          userId: fav.userId,
          type: "new_book",
          content: `${fav.author.name} の新刊「${book.title}」${releaseMessage}`,
          bookIsbn: book.isbn,
        };
      }),
    });
    createdCount += toCreate.length;
  }

  return NextResponse.json({ ok: true, created: createdCount });
}
