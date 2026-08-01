import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";

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

    const { title, author, isbn, awardId, year, type } = await request.json();

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

    // 著者名が変更された場合は findOrCreate
    if (author !== undefined) {
      const normalizedAuthor = normalizeAuthorName(author);
      let authorRecord = await prisma.author.findFirst({ where: { name: normalizedAuthor } });
      if (!authorRecord) {
        authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
      }
      await prisma.book.update({
        where: { id: entry.bookId },
        data: {
          ...(title !== undefined && { title }),
          ...(isbn !== undefined && { isbn: isbn || null }),
          authorId: authorRecord.id,
        },
      });
    } else if (title !== undefined || isbn !== undefined) {
      await prisma.book.update({
        where: { id: entry.bookId },
        data: {
          ...(title !== undefined && { title }),
          ...(isbn !== undefined && { isbn: isbn || null }),
        },
      });
    }

    const updated = await prisma.awardEntry.update({
      where: { id: entryId },
      data: {
        ...(type !== undefined && { type }),
        ...(year !== undefined && { year }),
        ...(awardId !== undefined && { awardId }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[PATCH /api/admin/award-entries/[id]]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
