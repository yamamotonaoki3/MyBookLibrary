import "server-only";

import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { logger } from "@/lib/logger";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import {
  resolvePreferringHardcover,
  collectEditionCandidates,
  BACKGROUND_COLLECT_OPTIONS,
  USER_FACING_RESOLVE_OPTIONS,
} from "@/lib/editionResolver";
import { addIsbns } from "@/lib/bookIsbn";
import {
  createBookOrReuseExisting,
  createNotifications,
  deleteReadingStatus,
  findBookByIsbn,
  findBookByTitleAndAuthor,
  findOrCreateAuthorByName,
  findReadingStatusValue,
  findUserName,
  upsertReadingStatus,
  type ReadingStatusValue,
} from "@/repositories/readingStatusRepository";

export type SaveReadingStatusInput = {
  userId: number;
  status: ReadingStatusValue;
  title: string;
  author: string;
  isbn?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  source?: "rakuten" | "manual";
};

export type SaveReadingStatusResult = {
  /** レスポンス本文（JSON） */
  body: unknown;
  /**
   * レスポンス送信後に実行する処理（新規登録した本の他版ISBN収集）。
   * 外部API呼び出しと固定の待機を含むため、ユーザーの待ち時間に含めない。
   */
  afterResponse?: () => Promise<void>;
};

/** 相互フォローの相手へ「読みたい本に追加した」通知を作成する。失敗しても保存自体は成功させる。 */
async function notifyMutualFollowersOfWantToRead(userId: number, book: { title: string }) {
  try {
    const mutualFollowerIds = await getMutualFollowerIds(userId);
    if (mutualFollowerIds.length === 0) return;

    const me = await findUserName(userId);
    if (!me) return;

    // bookIsbn は Notification の一意制約 (userId, type, bookIsbn) の対象のため、
    // ここで設定すると別の相互フォロー相手が同じ本を追加した際に通知が上書き・消失してしまう。
    // 本種別は bookTitle のみ保持し、bookIsbn は設定しない（本詳細への直接リンクは行わない）。
    await createNotifications(
      mutualFollowerIds.map((partnerId) => ({
        userId: partnerId,
        type: "mutual_want_to_read",
        content: `${me.name}さんが「${book.title}」を読みたい本に追加しました。`,
        actorId: userId,
        bookTitle: book.title,
      }))
    );
  } catch (error) {
    logger.error({ err: error }, "[readingStatusService] failed to notify mutual followers");
  }
}

/**
 * 読書ステータスを保存する。本がDBに無ければ、NDL・楽天から版を解決して登録する。
 * 外部APIが遅い・応答しない場合に備え、版の解決には時間制限を設けている
 * （USER_FACING_RESOLVE_OPTIONS）。
 */
export async function saveReadingStatus(input: SaveReadingStatusInput): Promise<SaveReadingStatusResult> {
  const { userId, isbn, title, author, coverImageUrl, status, publishedAt, source } = input;
  let afterResponse: (() => Promise<void>) | undefined;

  // 著者名を正規化してからDB検索・保存（スペース違いによる分裂防止）
  const normalizedAuthor = normalizeAuthorName(author);
  const authorRecord = await findOrCreateAuthorByName(normalizedAuthor);

  // 1. ISBNで検索
  // 2. 見つからなければタイトル+著者で検索（版違いの重複登録を防ぐ）
  // 3. それでも見つからなければ新規作成
  let book = isbn ? await findBookByIsbn(isbn) : null;
  if (!book) {
    book = await findBookByTitleAndAuthor(title, authorRecord.id);
  }

  if (!book) {
    // 絶版等で渡されたisbn（文庫等）よりも良い版（単行本）がNDL/楽天にあれば、
    // そちらを優先して登録する。
    const resolved = await resolvePreferringHardcover(
      {
        title,
        author: normalizedAuthor,
        fallback: {
          title,
          author: normalizedAuthor,
          isbn: isbn || "",
          largeImageUrl: coverImageUrl ?? undefined,
          salesDate: publishedAt ?? undefined,
        },
      },
      USER_FACING_RESOLVE_OPTIONS
    );

    // 解決したISBNが渡されたisbnと異なる（単行本が優先された）場合、
    // 既に他経路で登録済みでないか確認する（Unique制約に抵触しないためのガード）。
    if (resolved.isbn && resolved.isbn !== isbn) {
      const existingByResolvedIsbn = await findBookByIsbn(resolved.isbn);
      if (existingByResolvedIsbn) {
        book = existingByResolvedIsbn;
      }
    }

    if (!book) {
      const resolvedPublishedAt = resolved.salesDate ?? publishedAt;
      const created = await createBookOrReuseExisting(
        {
          title: resolved.title,
          authorId: authorRecord.id,
          isbn: resolved.isbn || null,
          coverImageUrl: resolved.largeImageUrl ?? coverImageUrl ?? null,
          publishedAt: resolvedPublishedAt
            ? (parseSalesDateToUtcDate(resolvedPublishedAt) ?? new Date())
            : new Date(),
          source: source ?? "rakuten",
          createdByUserId: userId,
        },
        resolved.isbn || isbn || undefined
      );
      book = created;

      // 新規作成時のみ、同一タイトル・著者の他版ISBNをNDL/楽天から収集してBookIsbnへ保存する。
      // 既存Book一致時は毎回の呼び出しコストが大きいため対象外とする。
      // 固定の待機と外部API呼び出しを含むため、レスポンス送信後に実行する。
      // 失敗してもBook登録自体には影響させない。
      afterResponse = async () => {
        try {
          const candidates = await collectEditionCandidates(
            { title: resolved.title, author: resolved.author },
            BACKGROUND_COLLECT_OPTIONS
          );
          await addIsbns(created.id, candidates, { primaryIsbn: created.isbn ?? undefined });
        } catch (err) {
          logger.error({ err }, "[readingStatusService] failed to collect edition candidates");
        }
      };
    }
  }

  // 未読はデフォルト状態（レコードなし）なので削除、それ以外はupsert
  if (status === "unread") {
    await deleteReadingStatus(userId, book.id);
    return { body: { status: "unread", bookId: book.id }, afterResponse };
  }

  const existingStatus = await findReadingStatusValue(userId, book.id);
  const readingStatus = await upsertReadingStatus(userId, book.id, status);

  // 同時リクエストが重なった場合に稀に通知が重複しうるが、行ロックによる
  // 直列化はInnoDBのギャップロック同士でデッドロックを招くリスクがあるため採用しない
  // （保存自体が失敗する方が、通知が稀に重複するより悪い）。
  // 通知はDBのみの処理で速いため、従来どおり応答前に完了させる。
  if (status === "want_to_read" && (!existingStatus || existingStatus.status !== "want_to_read")) {
    await notifyMutualFollowersOfWantToRead(userId, { title: book.title });
  }

  return { body: readingStatus, afterResponse };
}
