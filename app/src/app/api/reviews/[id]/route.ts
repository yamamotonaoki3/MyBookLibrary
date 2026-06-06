import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

type Props = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const reviewId = Number(id);

    if (isNaN(reviewId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review) {
      return NextResponse.json(
        { error: "レビューが見つかりません。" },
        { status: 404 }
      );
    }

    if (review.userId !== TEMP_USER_ID) {
      return NextResponse.json(
        { error: "他のユーザーのレビューは削除できません。" },
        { status: 403 }
      );
    }

    await prisma.review.delete({ where: { id: reviewId } });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { body, isSpoiler } = await request.json();
    const { id } = await params;
    const reviewId = Number(id);

    if (isNaN(reviewId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const review = await prisma.review.findUnique({ where: { id: reviewId } });

    if (!review) {
      return NextResponse.json(
        { error: "レビューが見つかりません。" },
        { status: 404 }
      );
    }

    if (review.userId !== TEMP_USER_ID) {
      return NextResponse.json(
        { error: "他のユーザーのレビューは編集できません。" },
        { status: 403 }
      );
    }
    const data: { body?: string; isSpoiler?: boolean } = {};

    if (body !== undefined) {
      if (typeof body !== "string" || body.trim() === "") {
        return NextResponse.json(
          { error: "感想を入力してください。" },
          { status: 400 }
        );
      }
      data.body = body.trim();
    }

    if (isSpoiler !== undefined) {
      data.isSpoiler = Boolean(isSpoiler);
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[PATCH /api/reviews]", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
