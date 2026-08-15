import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";
import { z } from "zod";

const EditBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(100),
  isbn: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  publishedAt: z.string().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const { id } = await params;
    const bookId = Number(id);
    if (isNaN(bookId)) {
      return Response.json({ error: "Invalid book id" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (book.source !== "manual") {
      return Response.json({ error: "この本は編集できません" }, { status: 403 });
    }

    // 編集できるのは本の登録者のみ
    if (book.createdByUserId !== userId) {
      return Response.json({ error: "この本を編集する権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = EditBookSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { title, author, isbn, coverImageUrl, publishedAt } = parsed.data;

    let publishedAtDate: Date | null = null;
    if (publishedAt) {
      publishedAtDate = parseSalesDateToUtcDate(publishedAt);
      if (!publishedAtDate) {
        return Response.json({ error: "出版年月日の形式が正しくありません" }, { status: 400 });
      }
    }

    const normalizedAuthor = normalizeAuthorName(author);
    let authorRecord = await prisma.author.findFirst({
      where: { name: normalizedAuthor },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
    }

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: {
        title,
        authorId: authorRecord.id,
        isbn: isbn || null,
        coverImageUrl: coverImageUrl ?? null,
        publishedAt: publishedAtDate ?? book.publishedAt,
      },
      include: { author: true },
    });

    return Response.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[PATCH /api/books/[id]]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const { id } = await params;
    const bookId = Number(id);
    if (isNaN(bookId)) {
      return Response.json({ error: "Invalid book id" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (book.source !== "manual") {
      return Response.json({ error: "この本は削除できません" }, { status: 403 });
    }

    if (book.createdByUserId !== userId) {
      return Response.json({ error: "この本を削除する権限がありません" }, { status: 403 });
    }

    // 関連レコードを順番に削除してから本を削除
    const reviews = await prisma.review.findMany({ where: { bookId }, select: { id: true } });
    const reviewIds = reviews.map((r) => r.id);
    await prisma.like.deleteMany({ where: { reviewId: { in: reviewIds } } });
    await prisma.report.deleteMany({ where: { reviewId: { in: reviewIds } } });
    await prisma.review.deleteMany({ where: { bookId } });
    await prisma.readingStatus.deleteMany({ where: { bookId } });
    await prisma.book.delete({ where: { id: bookId } });

    return Response.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[DELETE /api/books/[id]]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
