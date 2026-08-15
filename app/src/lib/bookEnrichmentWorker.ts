import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAuditEvent, AUDIT_EVENT } from "@/lib/auditLog";
import { searchBooks, searchBooksByIsbn } from "@/lib/rakuten";
import { searchBooksNdl } from "@/lib/ndl";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";

// 楽天・NDLとも実質的にQPS1程度が上限のため、呼び出し間に待機を挿入する。
// NDLサーチAPIの利用規約でも多重アクセス（同時並行アクセス）は避けるよう明記されている。
const RAKUTEN_WAIT_MS = 700;
const NDL_WAIT_MS = 1100;
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 処理中に他プロセスからジョブが停止・削除されていないかの確認間隔（1件ごとの外部APIコストを避けるため件数間引き）
const TICK_UPDATE_INTERVAL = 5;

async function enrichBook(book: {
  id: number;
  isbn: string | null;
  title: string;
  coverImageUrl: string | null;
  publishedAtUnknown: boolean;
  author: { name: string };
}): Promise<void> {
  let isbn = book.isbn;
  let coverImageUrl = book.coverImageUrl;
  let publishedAt: Date | null = null;

  // 1. ISBNが分かっていれば楽天のISBN検索で書影・出版年を補う
  if (isbn && (!coverImageUrl || book.publishedAtUnknown)) {
    const rakutenBook = await searchBooksByIsbn(isbn);
    await sleep(RAKUTEN_WAIT_MS);
    if (rakutenBook) {
      coverImageUrl = coverImageUrl ?? rakutenBook.largeImageUrl ?? null;
      if (book.publishedAtUnknown && rakutenBook.salesDate) {
        publishedAt = parseSalesDateToUtcDate(rakutenBook.salesDate);
      }
    }
  }

  // 2. ISBNまたは書影がまだ無ければ、タイトル+著者で楽天検索
  if (!isbn || !coverImageUrl) {
    const results = await searchBooks({ title: book.title, author: book.author.name });
    await sleep(RAKUTEN_WAIT_MS);
    const match = results[0];
    if (match) {
      isbn = isbn ?? (match.isbn || null);
      coverImageUrl = coverImageUrl ?? match.largeImageUrl ?? null;
      if (book.publishedAtUnknown && !publishedAt && match.salesDate) {
        publishedAt = parseSalesDateToUtcDate(match.salesDate);
      }
    }
  }

  // 3. それでもISBNが不明ならNDLサーチAPIでタイトル+著者から検索
  if (!isbn) {
    const { items } = await searchBooksNdl({
      type: "keyword",
      q: `${book.title} ${book.author.name}`,
      page: 1,
    });
    await sleep(NDL_WAIT_MS);
    const match = items[0];
    if (match?.isbn) {
      isbn = match.isbn;
      if (book.publishedAtUnknown && !publishedAt && match.salesDate) {
        publishedAt = parseSalesDateToUtcDate(match.salesDate);
      }
    }
  }

  const data: {
    isbn?: string;
    coverImageUrl?: string;
    publishedAt?: Date;
    publishedAtUnknown?: boolean;
  } = {};
  if (isbn && isbn !== book.isbn) data.isbn = isbn;
  if (coverImageUrl && coverImageUrl !== book.coverImageUrl) data.coverImageUrl = coverImageUrl;
  if (publishedAt) {
    data.publishedAt = publishedAt;
    data.publishedAtUnknown = false;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("補完できるデータが見つかりませんでした");
  }

  // 既存のISBNと重複する可能性があるため一意制約違反はスキップ扱いにする
  await prisma.book.update({ where: { id: book.id }, data }).catch((err) => {
    throw new Error(
      `DB更新に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    );
  });
}

export async function processEnrichmentJob(jobId: number): Promise<void> {
  const job = await prisma.bookEnrichmentJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "running") return;

  // watchdogによる再開時に、停止した旧ワーカーのリース期限が切れたアイテムだけを処理対象へ戻す。
  await prisma.bookEnrichmentItem.updateMany({
    where: {
      jobId,
      status: "processing",
      updatedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    data: { status: "pending" },
  });

  await prisma.bookEnrichmentJob.update({
    where: { id: jobId },
    data: { lastTickAt: new Date() },
  });

  let processedSinceTick = 0;

  for (;;) {
    const item = await prisma.bookEnrichmentItem.findFirst({
      where: { jobId, status: "pending" },
      include: { book: { include: { author: true } } },
      orderBy: { id: "asc" },
    });
    if (!item) break;

    const claimed = await prisma.bookEnrichmentItem.updateMany({
      where: { id: item.id, status: "pending" },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    try {
      await enrichBook(item.book);
      await prisma.bookEnrichmentItem.update({
        where: { id: item.id },
        data: { status: "done" },
      });
      await prisma.bookEnrichmentJob.update({
        where: { id: jobId },
        data: { doneCount: { increment: 1 }, successCount: { increment: 1 } },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, bookId: item.bookId, jobId }, "[bookEnrichmentWorker] item failed");
      await prisma.bookEnrichmentItem.update({
        where: { id: item.id },
        data: { status: "error", errorMessage: message.slice(0, 500) },
      });
      await prisma.bookEnrichmentJob.update({
        where: { id: jobId },
        data: { doneCount: { increment: 1 }, failCount: { increment: 1 } },
      });
    }

    processedSinceTick++;
    if (processedSinceTick >= TICK_UPDATE_INTERVAL) {
      await prisma.bookEnrichmentJob.update({
        where: { id: jobId },
        data: { lastTickAt: new Date() },
      });
      processedSinceTick = 0;
    }
  }

  // 別ワーカーが確保済みのアイテムを処理中なら、そのワーカーに完了処理を任せる。
  const outstandingItemCount = await prisma.bookEnrichmentItem.count({
    where: { jobId, status: { in: ["pending", "processing"] } },
  });
  if (outstandingItemCount > 0) return;

  const completed = await prisma.bookEnrichmentJob.updateMany({
    where: { id: jobId, status: "running" },
    data: {
      status: "completed",
      activeSlot: null,
      finishedAt: new Date(),
      lastTickAt: new Date(),
    },
  });
  if (completed.count === 0) return;

  const finished = await prisma.bookEnrichmentJob.findUniqueOrThrow({ where: { id: jobId } });

  await recordAuditEvent({
    eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_COMPLETED,
    actorUserId: finished.startedByUserId,
    detail: {
      jobId,
      successCount: finished.successCount,
      failCount: finished.failCount,
    },
  });
}
