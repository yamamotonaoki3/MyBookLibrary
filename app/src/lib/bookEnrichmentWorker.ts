import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAuditEvent, AUDIT_EVENT } from "@/lib/auditLog";
import { searchBooks, searchBooksByIsbn } from "@/lib/rakuten";
import { searchBooksNdl, searchBookByIsbn } from "@/lib/ndl";
import { isPlausibleMatch } from "@/lib/matchUtils";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import type { Prisma } from "@/generated/prisma";

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

type IsbnCandidate = {
  title: string;
  author: string;
  isbn: string;
  lamp: "green" | "red";
};

type ResultDetail = {
  candidates?: IsbnCandidate[];
  candidateNote?: string;
};

type EnrichResult = { status: "done" } | { status: "needs_review"; resultDetail: ResultDetail };

async function enrichBook(book: {
  id: number;
  isbn: string | null;
  title: string;
  coverImageUrl: string | null;
  publishedAtUnknown: boolean;
  author: { name: string };
}): Promise<EnrichResult> {
  let isbn = book.isbn;
  let coverImageUrl = book.coverImageUrl;
  let publishedAt: Date | null = null;
  // 一致度が低く自動反映しなかった候補の記録（見つからなかった場合のエラーメッセージに付記する）
  let candidateNote: string | undefined;

  const target = { title: book.title, author: book.author.name };

  // フェーズ1: ISBNを確定させる（ISBN未確定時のみ、複数の手段をカスケードで試す）。
  // 書影・出版年はこのフェーズでは取得しない。ISBN確定後にフェーズ2で確定ISBNを基準に
  // まとめて取得することで、ISBNと書影・出版年が別レコード由来になる食い違いを防ぐ。
  if (!isbn) {
    // 1a. NDLのタイトル+著者厳密検索（スペース分割の誤推測をしないtitleAndAuthor）
    const { items: ndlStrictItems } = await searchBooksNdl({
      type: "titleAndAuthor",
      title: book.title,
      author: book.author.name,
      page: 1,
    });
    await sleep(NDL_WAIT_MS);
    const ndlStrictMatch = ndlStrictItems.find((item) => item.isbn && isPlausibleMatch(item, target));
    if (ndlStrictMatch?.isbn) {
      isbn = ndlStrictMatch.isbn;
    }

    // 1b. 楽天のタイトル+著者検索（CSVインポート由来のタイトル・著者名は
    // 正確なことが前提のため、1回のAND検索で候補を絞り込む）。
    // 候補が単一かつNDLで実在確認（グリーン）できた場合のみ自動反映し、
    // それ以外（候補が複数、またはレッドのみ）は自動反映せず、
    // 管理者が確認・選択できるよう候補一覧を記録するに留める。
    if (!isbn) {
      // dedupe:false — 単行本・文庫など同一タイトル・著者の複数版を
      // 別候補として扱えるようにする（重複排除するとISBN違いの版が
      // 1件に潰れてしまい、管理者が選ぶ機会自体が失われるため）
      const results = await searchBooks({
        title: book.title,
        author: book.author.name,
        dedupe: false,
      });
      await sleep(RAKUTEN_WAIT_MS);
      const seenIsbns = new Set<string>();
      const plausible = results.filter((r) => {
        if (!r.isbn || seenIsbns.has(r.isbn)) return false;
        if (!isPlausibleMatch({ title: r.title, author: r.author }, target)) return false;
        seenIsbns.add(r.isbn);
        return true;
      });

      if (plausible.length > 0) {
        const candidates: IsbnCandidate[] = [];
        for (const candidate of plausible) {
          const ndlBook = await searchBookByIsbn(candidate.isbn);
          await sleep(NDL_WAIT_MS);
          candidates.push({
            title: candidate.title,
            author: candidate.author,
            isbn: candidate.isbn,
            lamp: ndlBook ? "green" : "red",
          });
        }

        const greenCandidates = candidates.filter((c) => c.lamp === "green");
        if (candidates.length === 1 && greenCandidates.length === 1) {
          const sole = plausible[0];
          isbn = sole.isbn;
          coverImageUrl = coverImageUrl ?? sole.largeImageUrl ?? null;
          if (book.publishedAtUnknown && sole.salesDate) {
            publishedAt = parseSalesDateToUtcDate(sole.salesDate);
          }
        } else {
          return { status: "needs_review", resultDetail: { candidates } };
        }
      } else if (results[0]) {
        candidateNote = `候補「${results[0].title}」（${results[0].author}）は一致度が低いため自動反映しませんでした`;
      }
    }

    // 1c. それでも不明なら、NDLの全文検索でフォールバック。
    // フィールド指定なしの検索は誤検出のリスクが高いため、ここで見つかった候補は
    // ISBNとして自動採用せず、人が確認できるよう記録するのみに留める。
    if (!isbn) {
      const { items: anywhereItems } = await searchBooksNdl({
        type: "anywhere",
        q: `${book.title} ${book.author.name}`,
        page: 1,
      });
      await sleep(NDL_WAIT_MS);
      if (!candidateNote && anywhereItems[0]) {
        candidateNote = `候補「${anywhereItems[0].title}」（${anywhereItems[0].author}）は一致度が低いため自動反映しませんでした`;
      }
    }
  }

  // フェーズ2: 確定したISBNを基準に、書影・出版年をまとめて取得する
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
    const suffix = candidateNote ? `（${candidateNote}）` : "";
    throw new Error(`補完できるデータが見つかりませんでした${suffix}`);
  }

  // 既存のISBNと重複する可能性があるため一意制約違反はスキップ扱いにする
  await prisma.book.update({ where: { id: book.id }, data }).catch((err) => {
    throw new Error(
      `DB更新に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  return { status: "done" };
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
      const result = await enrichBook(item.book);
      if (result.status === "needs_review") {
        await prisma.bookEnrichmentItem.update({
          where: { id: item.id },
          data: {
            status: "needs_review",
            resultDetail: result.resultDetail as unknown as Prisma.InputJsonValue,
          },
        });
        await prisma.bookEnrichmentJob.update({
          where: { id: jobId },
          data: { doneCount: { increment: 1 }, reviewCount: { increment: 1 } },
        });
      } else {
        await prisma.bookEnrichmentItem.update({
          where: { id: item.id },
          data: { status: "done" },
        });
        await prisma.bookEnrichmentJob.update({
          where: { id: jobId },
          data: { doneCount: { increment: 1 }, successCount: { increment: 1 } },
        });
      }
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
      reviewCount: finished.reviewCount,
    },
  });
}
