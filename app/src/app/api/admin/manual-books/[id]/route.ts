import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const bookId = Number(id);
    if (isNaN(bookId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.source !== "manual") {
      return NextResponse.json({ error: "手動登録本が見つかりません。" }, { status: 404 });
    }

    const { title, author, isbn, coverImageUrl } = await request.json();

    let authorId = book.authorId;
    if (author !== undefined) {
      const normalizedAuthor = normalizeAuthorName(author);
      let authorRecord = await prisma.author.findFirst({ where: { name: normalizedAuthor } });
      if (!authorRecord) {
        authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
      }
      authorId = authorRecord.id;
    }

    const updated = await prisma.book.update({
      where: { id: bookId },
      data: {
        ...(title !== undefined && { title }),
        authorId,
        ...(isbn !== undefined && { isbn: isbn || null }),
        ...(coverImageUrl !== undefined && { coverImageUrl: coverImageUrl || null }),
      },
      include: { author: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/admin/manual-books/[id]]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const bookId = Number(id);
    if (isNaN(bookId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.source !== "manual") {
      return NextResponse.json({ error: "手動登録本が見つかりません。" }, { status: 404 });
    }

    const reviews = await prisma.review.findMany({ where: { bookId }, select: { id: true } });
    const reviewIds = reviews.map((r) => r.id);
    await prisma.like.deleteMany({ where: { reviewId: { in: reviewIds } } });
    await prisma.report.deleteMany({ where: { reviewId: { in: reviewIds } } });
    await prisma.review.deleteMany({ where: { bookId } });
    await prisma.readingStatus.deleteMany({ where: { bookId } });
    await prisma.awardEntry.deleteMany({ where: { bookId } });
    await prisma.book.delete({ where: { id: bookId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/admin/manual-books/[id]]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
