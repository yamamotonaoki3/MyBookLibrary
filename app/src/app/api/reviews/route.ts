import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ReviewSchema } from "@/lib/validations";

const TEMP_USER_ID = 1;

export async function GET() {
  try {
    const reviews = await prisma.review.findMany({
      where: { userId: TEMP_USER_ID },
      include: {
        book: { select: { id: true, title: true, coverImageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(reviews);
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();

    const parsed = ReviewSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { bookId, body, isSpoiler } = parsed.data;

    if (typeof bookId !== "number") {
      return NextResponse.json({ error: "bookId が不正です。" }, { status: 400 });
    }

    const review = await prisma.review.create({
      data: {
        userId: TEMP_USER_ID,
        bookId,
        body,
        isSpoiler: isSpoiler ?? false,
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
