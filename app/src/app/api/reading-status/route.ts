import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { ReadingStatusSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { logger } from "@/lib/logger";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import { resolvePreferringHardcover, collectEditionCandidates } from "@/lib/editionResolver";
import { addIsbns } from "@/lib/bookIsbn";

async function notifyMutualFollowersOfWantToRead(
  userId: number,
  book: { title: string }
) {
  try {
    const mutualFollowerIds = await getMutualFollowerIds(userId);
    if (mutualFollowerIds.length === 0) return;

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!me) return;

    // bookIsbn は Notification の一意制約 (userId, type, bookIsbn) の対象のため、
    // ここで設定すると別の相互フォロー相手が同じ本を追加した際に通知が上書き・消失してしまう。
    // 本種別は bookTitle のみ保持し、bookIsbn は設定しない（本詳細への直接リンクは行わない）。
    await prisma.notification.createMany({
      data: mutualFollowerIds.map((partnerId) => ({
        userId: partnerId,
        type: "mutual_want_to_read",
        content: `${me.name}さんが「${book.title}」を読みたい本に追加しました。`,
        actorId: userId,
        bookTitle: book.title,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[POST /api/reading-status] failed to notify mutual followers"
    );
  }
}


export async function POST(request: Request) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const body = await request.json();
    const parsed = ReadingStatusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { isbn, title, author, coverImageUrl, status, publishedAt, source } = parsed.data;

    // 著者名を正規化してからDB検索・保存（スペース違いによる分裂防止）
    const normalizedAuthor = normalizeAuthorName(author);
    let authorRecord = await prisma.author.findFirst({
      where: { name: normalizedAuthor },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
    }

    // 1. ISBNで検索
    // 2. 見つからなければタイトル+著者で検索（版違いの重複登録を防ぐ）
    // 3. それでも見つからなければ新規作成
    let book = isbn
      ? await prisma.book.findFirst({ where: { isbn } })
      : null;

    if (!book) {
      book = await prisma.book.findFirst({
        where: { title, authorId: authorRecord.id },
      });
    }

    if (!book) {
      // 絶版等で渡されたisbn（文庫等）よりも良い版（単行本）がNDL/楽天にあれば、
      // そちらを優先して登録する。
      const resolved = await resolvePreferringHardcover({
        title,
        author: normalizedAuthor,
        fallback: {
          title,
          author: normalizedAuthor,
          isbn: isbn || "",
          largeImageUrl: coverImageUrl ?? undefined,
          salesDate: publishedAt ?? undefined,
        },
      });

      // 解決したISBNが渡されたisbnと異なる（単行本が優先された）場合、
      // 既に他経路で登録済みでないか確認する（Unique制約に抵触しないためのガード）。
      if (resolved.isbn && resolved.isbn !== isbn) {
        const existingByResolvedIsbn = await prisma.book.findFirst({ where: { isbn: resolved.isbn } });
        if (existingByResolvedIsbn) {
          book = existingByResolvedIsbn;
        }
      }

      let isNewBook = false;
      if (!book) {
        const resolvedPublishedAt = resolved.salesDate ?? publishedAt;
        book = await prisma.book
          .create({
            data: {
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
          })
          .catch(async (err) => {
            // 同時リクエスト等でUnique制約に抵触した場合は、既存レコードを使う
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
              const existing = await prisma.book.findFirst({ where: { isbn: resolved.isbn || isbn || undefined } });
              if (existing) return existing;
            }
            throw err;
          });
        isNewBook = true;
      }

      // 新規作成時のみ、同一タイトル・著者の他版ISBNをNDL/楽天から収集してBookIsbnへ保存する。
      // 既存Book一致時は毎回の呼び出しコストが大きいため対象外とする。
      if (isNewBook && book) {
        try {
          const candidates = await collectEditionCandidates({
            title: resolved.title,
            author: resolved.author,
          });
          await addIsbns(book.id, candidates, { primaryIsbn: book.isbn ?? undefined });
        } catch (err) {
          // 複数版収集の失敗はBook登録自体を失敗させない
          logger.error({ err }, "[POST /api/reading-status] failed to collect edition candidates");
        }
      }
    }

    // 未読はデフォルト状態（レコードなし）なので削除、それ以外はupsert
    if (status === "unread") {
      await prisma.readingStatus.deleteMany({
        where: { userId: userId, bookId: book.id },
      });
      return Response.json({ status: "unread", bookId: book.id });
    }

    const existingStatus = await prisma.readingStatus.findUnique({
      where: { userId_bookId: { userId: userId, bookId: book.id } },
      select: { status: true },
    });

    const readingStatus = await prisma.readingStatus.upsert({
      where: { userId_bookId: { userId: userId, bookId: book.id } },
      update: { status },
      create: { userId: userId, bookId: book.id, status },
    });

    // 同時リクエストが重なった場合に稀に通知が重複しうるが、行ロックによる
    // 直列化はInnoDBのギャップロック同士でデッドロックを招くリスクがあるため採用しない
    // （保存自体が失敗する方が、通知が稀に重複するより悪い）。
    if (
      status === "want_to_read" &&
      (!existingStatus || existingStatus.status !== "want_to_read")
    ) {
      await notifyMutualFollowersOfWantToRead(userId, { title: book.title });
    }

    return Response.json(readingStatus);
  } catch (error) {
    logger.error({ err: error }, "[POST /api/reading-status]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
