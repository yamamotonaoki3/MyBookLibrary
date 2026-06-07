import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

type Props = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, { params }: Props) {
  try {
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
      where: { userId_reviewId: { userId: TEMP_USER_ID, reviewId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "すでにいいねしています。" },
        { status: 409 }
      );
    }

    await prisma.like.create({
      data: { userId: TEMP_USER_ID, reviewId },
    });

    if (review.userId !== TEMP_USER_ID) {
      await prisma.notification.create({
        data: {
          userId: review.userId,
          type: "like",
          content: `「${review.book.title}」のレビューにいいねが付きました`,
          bookIsbn: review.book.isbn ?? null,
        },
      });
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
    const { id } = await params;
    const reviewId = Number(id);

    if (isNaN(reviewId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const existing = await prisma.like.findUnique({
      where: { userId_reviewId: { userId: TEMP_USER_ID, reviewId } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "いいねしていません。" },
        { status: 404 }
      );
    }

    await prisma.like.delete({
      where: { userId_reviewId: { userId: TEMP_USER_ID, reviewId } },
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
