import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function POST(request: NextRequest) {
  try {
    const { bookId, body, isSpoiler } = await request.json();

    if (typeof body !== "string" || body.trim() === "") {
      return NextResponse.json(
        { error: "感想を入力してください。" },
        { status: 400 }
      );
    }

    if (typeof bookId !== "number") {
      return NextResponse.json({ error: "bookId が不正です。" }, { status: 400 });
    }

    const review = await prisma.review.create({
      data: {
        userId: TEMP_USER_ID,
        bookId,
        body: body.trim(),
        isSpoiler: Boolean(isSpoiler),
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
