import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";


type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const { id } = await params;
    const reviewId = Number(id);

    if (isNaN(reviewId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { book: { select: { title: true, isbn: true } } },
    });

    if (!review) {
      return NextResponse.json(
        { error: "レビューが見つかりません。" },
        { status: 404 }
      );
    }

    const existing = await prisma.like.findUnique({
      where: { userId_reviewId: { userId: userId, reviewId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "すでにいいねしています。" },
        { status: 409 }
      );
    }

    await prisma.like.create({
      data: { userId: userId, reviewId },
    });

    if (review.userId !== userId) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: { userId: review.userId, type: "like", bookIsbn: review.book.isbn },
      });
      if (!alreadyNotified) {
        await prisma.notification.create({
          data: {
            userId: review.userId,
            type: "like",
            content: "レビューにいいねが付きました",
            bookIsbn: review.book.isbn ?? null,
            bookTitle: review.book.title,
          },
        });
      }
    }

    const count = await prisma.like.count({ where: { reviewId } });

    return NextResponse.json({ liked: true, count }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/reviews/[id]/likes]", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const { id } = await params;
    const reviewId = Number(id);

    if (isNaN(reviewId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const existing = await prisma.like.findUnique({
      where: { userId_reviewId: { userId: userId, reviewId } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "いいねしていません。" },
        { status: 404 }
      );
    }

    await prisma.like.delete({
      where: { userId_reviewId: { userId: userId, reviewId } },
    });

    const count = await prisma.like.count({ where: { reviewId } });

    return NextResponse.json({ liked: false, count });
  } catch (e) {
    console.error("[DELETE /api/reviews/[id]/likes]", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
