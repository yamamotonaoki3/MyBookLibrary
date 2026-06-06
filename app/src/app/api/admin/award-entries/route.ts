import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";

// "2024年01月" "2024年01月中旬" などを Date に変換する
function parsePublishedAt(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const m = raw.match(/(\d{4})年(\d{2})月/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function POST(request: NextRequest) {
  try {
    const { title, author, isbn, coverImageUrl, publishedAt, awardId, year, type } =
      await request.json();

    if (!title || !author || !awardId || !year || !type) {
      return NextResponse.json(
        { error: "title, author, awardId, year, type は必須です。" },
        { status: 400 }
      );
    }
    if (type !== "winner" && type !== "nominee") {
      return NextResponse.json(
        { error: "type は winner または nominee を指定してください。" },
        { status: 400 }
      );
    }

    const normalizedAuthor = normalizeAuthorName(author);
    let authorRecord = await prisma.author.findFirst({
      where: { name: normalizedAuthor },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
    }

    let book = isbn
      ? await prisma.book.findFirst({ where: { isbn } })
      : await prisma.book.findFirst({ where: { title, authorId: authorRecord.id } });

    if (!book) {
      book = await prisma.book.create({
        data: {
          title,
          authorId: authorRecord.id,
          isbn: isbn || null,
          coverImageUrl: coverImageUrl ?? null,
          publishedAt: parsePublishedAt(publishedAt),
        },
      });
    }

    const awardEntry = await prisma.awardEntry.upsert({
      where: { bookId_awardId_year: { bookId: book.id, awardId, year } },
      update: { type },
      create: { bookId: book.id, awardId, year, type },
    });

    return NextResponse.json(awardEntry, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/award-entries]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
