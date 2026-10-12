import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateBookAndAwardEntry } from "@/repositories/awardEntryRepository";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { isBookIsbnConflictError, replaceIsbns } from "@/lib/bookIsbn";

type Props = { params: Promise<{ id: string }> };

const CURRENT_YEAR = new Date().getFullYear();

export async function DELETE(request: NextRequest, { params }: Props) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const entryId = Number(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const entry = await prisma.awardEntry.findUnique({
      where: { id: entryId },
      include: { book: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "受賞登録が見つかりません。" }, { status: 404 });
    }

    await prisma.awardEntry.delete({ where: { id: entryId } });

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_AWARD_ENTRY_DELETED,
      actorUserId: userId,
      targetType: "AwardEntry",
      targetId: entryId,
      detail: { bookTitle: entry.book.title, year: entry.year, type: entry.type },
      ipAddress: getClientIp(request),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "[DELETE /api/admin/award-entries/[id]]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const entryId = Number(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const { title, author, isbns, awardId, year, type } = await request.json();

    if (type !== undefined && type !== "winner" && type !== "nominee") {
      return NextResponse.json(
        { error: "type は winner または nominee を指定してください。" },
        { status: 400 }
      );
    }
    if (year !== undefined && (typeof year !== "number" || year < 1935 || year > CURRENT_YEAR)) {
      return NextResponse.json(
        { error: "year は 1935〜現在年 の数値を指定してください。" },
        { status: 400 }
      );
    }

    const entry = await prisma.awardEntry.findUnique({
      where: { id: entryId },
      include: { book: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "受賞登録が見つかりません。" }, { status: 404 });
    }

    // 複数の更新を、衝突の起きうる順に分けて実行する。いずれも再実行しても同じ結果に収束する（冪等）。
    // (1) ISBN の置き換え: 他の本との衝突検査を最初に行い、衝突時は何も書き込まずに失敗する。
    if (isbns !== undefined) {
      await replaceIsbns(
        prisma,
        entry.bookId,
        (isbns as { isbn: string; isPrimary: boolean }[]).map((item) => ({
          isbn: item.isbn,
          isPrimary: item.isPrimary,
        }))
      );
    }

    // (2) 著者名が変更された場合は findOrCreate（作成は再実行しても重複しない形で先に済ませる）
    let authorId: number | undefined;
    if (author !== undefined) {
      const normalizedAuthor = normalizeAuthorName(author);
      const authorRecord =
        (await prisma.author.findFirst({ where: { name: normalizedAuthor } })) ??
        (await prisma.author.create({ data: { name: normalizedAuthor } }));
      authorId = authorRecord.id;
    }

    // (3) 本と受賞登録の更新は、読み取りを挟まない書き込みとして原子的に実行する
    await updateBookAndAwardEntry({
      bookId: entry.bookId,
      entryId,
      book: { title, authorId },
      entry: { type, year, awardId },
    });
    const updated = await prisma.awardEntry.findUniqueOrThrow({ where: { id: entryId } });

    return NextResponse.json(updated);
  } catch (error) {
    if (isBookIsbnConflictError(error)) {
      return NextResponse.json(
        { error: "指定されたISBNは別の本にすでに登録されています。" },
        { status: 409 }
      );
    }
    logger.error({ err: error }, "[PATCH /api/admin/award-entries/[id]]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
