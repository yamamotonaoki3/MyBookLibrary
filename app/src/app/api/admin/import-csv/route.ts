import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { parseSalesDateToUtcDate } from "@/lib/dateParsing";

type ParsedRow = {
  title: string;
  normalizedAuthor: string;
  isbn: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null | undefined;
  awardId: number;
  year: number;
  type: "winner" | "nominee";
};

/** ダブルクォート囲み（内部 "" エスケープ）に対応したCSV行の分割。
 * クォートを含まない行は単純なカンマ分割と同じ結果になる。 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// CSVフォーマット: title,author,isbn,coverImageUrl,publishedAt,awardId,year,type
//
// エクスポート（award-entries/export/route.ts）は =+-@ 等で始まる値の先頭に
// CSVインジェクション対策のシングルクォートを付与するが、この付与を無条件に
// 取り除く処理は行わない。実際に "'" で始まる正当なタイトル・著者名（独自に
// 作成されたCSVも含む）と区別する手段がなく、誤って一般のCSVインポートの
// 値を書き換えてしまうため。=+-@ 等で始まるタイトルを再インポートした場合、
// 先頭にクォートが付いたまま新規本として登録される点は既知の制約とする。
function parseRow(row: string[]): ParsedRow {
  const [title, author, isbn, coverImageUrl, publishedAt, awardIdStr, yearStr, type] = row;

  if (!title || !author || !awardIdStr || !yearStr || !type) {
    throw new Error("必須フィールドが不足しています");
  }
  const awardId = parseInt(awardIdStr);
  const year = parseInt(yearStr);
  if (isNaN(awardId) || isNaN(year)) throw new Error("awardId・year は数値で指定してください");
  if (type !== "winner" && type !== "nominee") throw new Error("type は winner または nominee");

  return {
    title,
    normalizedAuthor: normalizeAuthorName(author),
    isbn: isbn?.trim() || null,
    coverImageUrl: coverImageUrl?.trim() || null,
    publishedAt,
    awardId,
    year,
    type,
  };
}

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "CSVファイルを指定してください。" }, { status: 400 });
    }

    // エクスポートCSV等のUTF-8 BOMを除去する
    const text = (await file.text()).replace(/^﻿/, "");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // ヘッダー行をスキップ
    const dataLines = lines[0]?.toLowerCase().startsWith("title") ? lines.slice(1) : lines;

    // 全行をパース（エラー行は収集して後でレポート）
    const parsedRows: { row: ParsedRow; lineIndex: number }[] = [];
    const errors: string[] = [];
    for (let i = 0; i < dataLines.length; i++) {
      try {
        parsedRows.push({ row: parseRow(splitCsvLine(dataLines[i])), lineIndex: i });
      } catch (e) {
        errors.push(`行 ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ success: 0, errors });
    }

    // 著者を一括取得・不足分を一括作成
    const authorNames = [...new Set(parsedRows.map((p) => p.row.normalizedAuthor))];
    const existingAuthors = await prisma.author.findMany({
      where: { name: { in: authorNames } },
      select: { id: true, name: true },
    });
    const authorMap = new Map(existingAuthors.map((a) => [a.name, a.id]));

    const missingAuthors = authorNames.filter((n) => !authorMap.has(n));
    if (missingAuthors.length > 0) {
      await prisma.author.createMany({
        data: missingAuthors.map((name) => ({ name })),
        skipDuplicates: true,
      });
      const newAuthors = await prisma.author.findMany({
        where: { name: { in: missingAuthors } },
        select: { id: true, name: true },
      });
      for (const a of newAuthors) authorMap.set(a.name, a.id);
    }

    // 書籍を一括取得
    const isbns = parsedRows.map((p) => p.row.isbn).filter((v): v is string => v !== null);
    const titles = parsedRows.map((p) => p.row.title);
    const existingBooks = await prisma.book.findMany({
      where: { OR: [{ isbn: { in: isbns } }, { title: { in: titles } }] },
      select: { id: true, isbn: true, title: true, authorId: true },
    });
    const bookByIsbn = new Map(existingBooks.filter((b) => b.isbn).map((b) => [b.isbn, b]));
    const bookByTitleAuthor = new Map(
      existingBooks.map((b) => [`${b.title}::${b.authorId}`, b])
    );

    let success = 0;

    for (const { row, lineIndex } of parsedRows) {
      try {
        const authorId = authorMap.get(row.normalizedAuthor);
        if (!authorId) throw new Error(`著者 "${row.normalizedAuthor}" の取得に失敗しました`);

        let book =
          (row.isbn ? bookByIsbn.get(row.isbn) : undefined) ??
          bookByTitleAuthor.get(`${row.title}::${authorId}`);

        if (!book) {
          // 管理者代理登録のため createdByUserId は意図的に設定しない
          const parsedPublishedAt = parseSalesDateToUtcDate(row.publishedAt, {
            allowIsoFallback: true,
          });
          book = await prisma.book.create({
            data: {
              title: row.title,
              authorId,
              isbn: row.isbn,
              coverImageUrl: row.coverImageUrl,
              publishedAt: parsedPublishedAt ?? new Date(),
              publishedAtUnknown: parsedPublishedAt === null,
            },
            select: { id: true, isbn: true, title: true, authorId: true },
          });
          if (book.isbn) bookByIsbn.set(book.isbn, book);
          bookByTitleAuthor.set(`${book.title}::${book.authorId}`, book);
        }

        await prisma.awardEntry.upsert({
          where: { bookId_awardId_year: { bookId: book.id, awardId: row.awardId, year: row.year } },
          update: { type: row.type },
          create: { bookId: book.id, awardId: row.awardId, year: row.year, type: row.type },
        });
        success++;
      } catch (e) {
        errors.push(`行 ${lineIndex + 2}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_CSV_IMPORTED,
      actorUserId: userId,
      detail: { success, errorCount: errors.length },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success, errors });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/admin/import-csv]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
