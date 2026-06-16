import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const entries = await prisma.awardEntry.findMany({
      include: {
        book: { include: { author: true } },
        award: true,
      },
      orderBy: [{ award: { name: "asc" } }, { year: "desc" }],
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("[GET /api/admin/award-entries]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

// "2024年01月15日" "2024年01月" "20240115" などを Date に変換する
function parsePublishedAt(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  // "2024年01月15日" or "2024年01月"
  const mJa = raw.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (mJa) {
    return new Date(
      parseInt(mJa[1]),
      parseInt(mJa[2]) - 1,
      mJa[3] ? parseInt(mJa[3]) : 1
    );
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

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

    const existing = await prisma.awardEntry.findUnique({
      where: { bookId_awardId_year: { bookId: book.id, awardId, year } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "この本・賞・年度の組み合わせは既に登録されています。" },
        { status: 409 }
      );
    }

    const awardEntry = await prisma.awardEntry.create({
      data: { bookId: book.id, awardId, year, type },
    });

    return NextResponse.json(awardEntry, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "この本・賞・年度の組み合わせは既に登録されています。" },
          { status: 409 }
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "指定した文学賞が存在しません。" },
          { status: 400 }
        );
      }
    }
    console.error("[POST /api/admin/award-entries]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
