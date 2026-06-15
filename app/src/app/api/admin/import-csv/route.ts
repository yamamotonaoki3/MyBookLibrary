import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";

function parsePublishedAt(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const m = raw.match(/(\d{4})年(\d{2})月/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

// CSVフォーマット: title,author,isbn,coverImageUrl,publishedAt,awardId,year,type
async function registerRow(row: string[]): Promise<void> {
  const [title, author, isbn, coverImageUrl, publishedAt, awardIdStr, yearStr, type] = row;

  if (!title || !author || !awardIdStr || !yearStr || !type) {
    throw new Error("必須フィールドが不足しています");
  }
  const awardId = parseInt(awardIdStr);
  const year = parseInt(yearStr);
  if (isNaN(awardId) || isNaN(year)) throw new Error("awardId・year は数値で指定してください");
  if (type !== "winner" && type !== "nominee") throw new Error("type は winner または nominee");

  const normalizedAuthor = normalizeAuthorName(author);
  let authorRecord = await prisma.author.findFirst({ where: { name: normalizedAuthor } });
  if (!authorRecord) {
    authorRecord = await prisma.author.create({ data: { name: normalizedAuthor } });
  }

  let book = isbn?.trim()
    ? await prisma.book.findFirst({ where: { isbn: isbn.trim() } })
    : await prisma.book.findFirst({ where: { title, authorId: authorRecord.id } });

  if (!book) {
    book = await prisma.book.create({
      data: {
        title,
        authorId: authorRecord.id,
        isbn: isbn?.trim() || null,
        coverImageUrl: coverImageUrl?.trim() || null,
        publishedAt: parsePublishedAt(publishedAt?.trim()),
      },
    });
  }

  await prisma.awardEntry.upsert({
    where: { bookId_awardId_year: { bookId: book.id, awardId, year } },
    update: { type },
    create: { bookId: book.id, awardId, year, type },
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "CSVファイルを指定してください。" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // ヘッダー行をスキップ
    const dataLines = lines[0]?.toLowerCase().startsWith("title") ? lines.slice(1) : lines;

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const row = dataLines[i].split(",");
      try {
        await registerRow(row);
        success++;
      } catch (e) {
        errors.push(`行 ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ success, errors });
  } catch (error) {
    console.error("[POST /api/admin/import-csv]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
