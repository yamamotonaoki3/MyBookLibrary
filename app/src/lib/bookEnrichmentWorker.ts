import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAuditEvent, AUDIT_EVENT } from "@/lib/auditLog";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { searchBooksNdl, searchBookByIsbn } from "@/lib/ndl";
import { isPlausibleMatch } from "@/lib/matchUtils";
import { collectEditionCandidates, NDL_WAIT_MS, RAKUTEN_WAIT_MS } from "@/lib/editionResolver";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import { addIsbns, setPrimaryIsbn } from "@/lib/bookIsbn";
import type { Prisma } from "@/generated/prisma";

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
  isLikelyHardcover?: boolean;
};

type ResultDetail = {
  candidates?: IsbnCandidate[];
  candidateNote?: string;
  // 成功時に実際に更新したフィールドの一覧（例: ["ISBN", "書影"]）
  updatedFields?: string[];
};

type EnrichResult =
  | { status: "done"; resultDetail: ResultDetail }
  | { status: "needs_review"; resultDetail: ResultDetail };

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
  // 既にISBNが確定していた本で、他版ISBNを新たに収集できたかどうか
  let backfilledEditions = false;

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

    // 1b. NDL単行本候補＋楽天のタイトル+著者検索（dedupe:false）をマージして候補収集する。
    // 単行本・文庫等の複数版を1件に統合せず、isPlausibleMatchを満たす候補すべてを対象とする。
    // 候補が単一かつ実在確認（グリーン）できた場合のみ自動反映し、それ以外（候補が複数、
    // またはレッドのみ）は自動反映せず、管理者が確認・選択できるよう候補一覧を記録する。
    if (!isbn) {
      const merged = await collectEditionCandidates({ title: book.title, author: book.author.name });

      if (merged.length > 0) {
        // 見つかった候補ISBNは、管理者が確認・選択する前の時点ですべてBookIsbnへ登録しておく。
        // 一括補完の対象外になった版も含めて、後から在庫確認モーダルで参照できるようにするため。
        try {
          await addIsbns(book.id, merged.map((c) => ({ isbn: c.isbn, source: c.origin })));
        } catch (err) {
          logger.error({ err, bookId: book.id }, "[bookEnrichmentWorker] failed to save edition candidates to BookIsbn");
        }

        const candidates: IsbnCandidate[] = [];
        for (const candidate of merged) {
          // NDL単行本候補は検索時点で既にNDLでの実在が確認済みのため、再確認は行わない。
          // 楽天由来の候補のみNDLで実在確認する。
          let lamp: "green" | "red";
          if (candidate.origin === "ndl") {
            lamp = "green";
          } else {
            const ndlBook = await searchBookByIsbn(candidate.isbn);
            await sleep(NDL_WAIT_MS);
            lamp = ndlBook ? "green" : "red";
          }
          candidates.push({
            title: candidate.title,
            author: candidate.author,
            isbn: candidate.isbn,
            lamp,
            isLikelyHardcover: candidate.isLikelyHardcover,
          });
        }

        const greenCandidates = candidates.filter((c) => c.lamp === "green");
        if (candidates.length === 1 && greenCandidates.length === 1) {
          isbn = merged[0].isbn;
          // 書影・出版年はフェーズ2で確定ISBNを基準に取得するため、ここでは設定しない。
        } else {
          return { status: "needs_review", resultDetail: { candidates } };
        }
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
  } else {
    // 既にISBNが確定している本でも、BookIsbnが1件も無ければ他版を遡って収集する。
    // seedデータや「受賞作品登録」など、複数版収集ロジックを経由せず登録された本を対象とする。
    const existingIsbnCount = await prisma.bookIsbn.count({ where: { bookId: book.id } });
    if (existingIsbnCount === 0) {
      try {
        const merged = await collectEditionCandidates({ title: book.title, author: book.author.name });
        if (merged.length > 0) {
          await addIsbns(book.id, merged.map((c) => ({ isbn: c.isbn, source: c.origin })));
          backfilledEditions = true;
        }
      } catch (err) {
        logger.error({ err, bookId: book.id }, "[bookEnrichmentWorker] failed to backfill edition candidates for existing isbn");
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

  if (Object.keys(data).length === 0 && !backfilledEditions) {
    // ISBN・書影・出版年のうち、何が不足したままなのかを明示する
    const missing: string[] = [];
    if (!isbn) missing.push("ISBN");
    if (!coverImageUrl) missing.push("書影");
    if (book.publishedAtUnknown && !publishedAt) missing.push("出版年");
    const missingLabel = missing.length > 0 ? missing.join("・") : "データ";
    const suffix = candidateNote ? `（${candidateNote}）` : "";
    throw new Error(`${missingLabel}が見つかりませんでした${suffix}`);
  }

  if (Object.keys(data).length > 0) {
    // 既存のISBNと重複する可能性があるため一意制約違反はスキップ扱いにする
    await prisma.book.update({ where: { id: book.id }, data }).catch((err) => {
      throw new Error(
        `DB更新に失敗しました: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  // ISBNが確定していれば（今回新たに解決した場合・元から確定していた場合いずれも）
  // BookIsbn側の代表ISBNを同期する。addIsbnsで存在を保証してから設定する。
  if (isbn) {
    try {
      await addIsbns(book.id, [{ isbn, source: data.isbn ? "ndl" : "existing" }]);
      await setPrimaryIsbn(book.id, isbn);
    } catch (err) {
      logger.error({ err, bookId: book.id }, "[bookEnrichmentWorker] failed to sync primary BookIsbn");
    }
  }

  const updatedFields: string[] = [];
  if (data.isbn) updatedFields.push("ISBN");
  if (data.coverImageUrl) updatedFields.push("書影");
  if (data.publishedAt) updatedFields.push("出版年");
  if (backfilledEditions) updatedFields.push("複数版ISBN");

  return { status: "done", resultDetail: { updatedFields } };
}

// 監査ログのdetailに含める本の一覧は際限なく大きくならないよう上限を設ける
const AUDIT_LOG_BOOK_LIST_LIMIT = 200;

async function buildBookListsForAudit(jobId: number) {
  const [doneItems, errorItems] = await Promise.all([
    prisma.bookEnrichmentItem.findMany({
      where: { jobId, status: "done" },
      include: { book: { select: { title: true } } },
      orderBy: { id: "asc" },
      take: AUDIT_LOG_BOOK_LIST_LIMIT,
    }),
    prisma.bookEnrichmentItem.findMany({
      where: { jobId, status: "error" },
      include: { book: { select: { title: true } } },
      orderBy: { id: "asc" },
      take: AUDIT_LOG_BOOK_LIST_LIMIT,
    }),
  ]);

  return {
    succeededBooks: doneItems.map((i) => ({
      title: i.book.title,
      updatedFields: (i.resultDetail as ResultDetail | null)?.updatedFields ?? [],
    })),
    failedBooks: errorItems.map((i) => ({
      title: i.book.title,
      errorMessage: i.errorMessage,
    })),
  };
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
  let cancelled = false;

  for (;;) {
    // 管理者が「中断」ボタンを押していないか、次のアイテムを処理する前に確認する。
    const currentJob = await prisma.bookEnrichmentJob.findUnique({
      where: { id: jobId },
      select: { cancelRequested: true },
    });
    if (currentJob?.cancelRequested) {
      cancelled = true;
      break;
    }

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
          data: {
            status: "done",
            resultDetail: result.resultDetail as unknown as Prisma.InputJsonValue,
          },
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

  if (cancelled) {
    // 中断リクエスト時点で未処理だったアイテムはcancelledにする
    await prisma.bookEnrichmentItem.updateMany({
      where: { jobId, status: { in: ["pending", "processing"] } },
      data: { status: "cancelled" },
    });

    const cancelledJob = await prisma.bookEnrichmentJob.updateMany({
      where: { id: jobId, status: "running" },
      data: {
        status: "cancelled",
        activeSlot: null,
        finishedAt: new Date(),
        lastTickAt: new Date(),
      },
    });
    if (cancelledJob.count === 0) return;

    const finished = await prisma.bookEnrichmentJob.findUniqueOrThrow({ where: { id: jobId } });
    const { succeededBooks, failedBooks } = await buildBookListsForAudit(jobId);

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_CANCELLED,
      actorUserId: finished.startedByUserId,
      detail: {
        jobId,
        successCount: finished.successCount,
        failCount: finished.failCount,
        reviewCount: finished.reviewCount,
        succeededBooks,
        failedBooks,
      },
    });
    return;
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
  const { succeededBooks, failedBooks } = await buildBookListsForAudit(jobId);

  await recordAuditEvent({
    eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_COMPLETED,
    actorUserId: finished.startedByUserId,
    detail: {
      jobId,
      successCount: finished.successCount,
      failCount: finished.failCount,
      reviewCount: finished.reviewCount,
      succeededBooks,
      failedBooks,
    },
  });
}
