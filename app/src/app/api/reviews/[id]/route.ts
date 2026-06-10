import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ReviewSchema } from "@/lib/validations";
import { getAuthenticatedUserId } from "@/lib/session";


type Props = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
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

    if (review.userId !== userId) {
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
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
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

    if (review.userId !== userId) {
      return NextResponse.json(
        { error: "他のユーザーのレビューは編集できません。" },
        { status: 403 }
      );
    }
    const patchSchema = ReviewSchema.pick({ body: true, isSpoiler: true });
    const parsed = patchSchema.safeParse({ body, isSpoiler });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const data: { body?: string; isSpoiler?: boolean } = {};
    if (parsed.data.body !== undefined) data.body = parsed.data.body;
    if (parsed.data.isSpoiler !== undefined) data.isSpoiler = parsed.data.isSpoiler;

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
