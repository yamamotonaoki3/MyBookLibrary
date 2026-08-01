import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

/** フィールドをCSV用にエスケープする。
 * インポートが行単位でパースするため、改行はスペースに正規化して1レコード1行を保証する。
 *
 * 値が =+-@ もしくはタブで始まる場合、Excel等がクォート内でも数式として解釈し
 * CSVインジェクションの起点になりうるため、先頭にシングルクォートを付与して無害化する
 * （OWASPのCSVインジェクション対策ガイダンスに準拠）。
 * このシングルクォートはインポート側では取り除かない（import-csv/route.ts 参照）。
 * 通常のタイトル・著者名がこれらの文字で始まることは実質的にないため、
 * 再インポート時に稀にクォート付きの新規本として登録される点は許容する。 */
function escapeCsvField(value: string): string {
  const singleLine = value.replace(/[\r\n]+/g, " ");
  const neutralized = /^[\t=+\-@]/.test(singleLine) ? `'${singleLine}` : singleLine;
  if (/[",]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/** インポートの parsePublishedAt が日まで復元できるよう ISO 形式（YYYY-MM-DD）で出力する */
function formatPublishedAt(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

    // インポート（/api/admin/import-csv）と同一のフォーマット
    const header = "title,author,isbn,coverImageUrl,publishedAt,awardId,year,type";
    const rows = entries.map((e) =>
      [
        e.book.title,
        e.book.author.name,
        e.book.isbn ?? "",
        e.book.coverImageUrl ?? "",
        formatPublishedAt(e.book.publishedAt),
        String(e.awardId),
        String(e.year),
        e.type,
      ]
        .map(escapeCsvField)
        .join(",")
    );

    // Excel での文字化け対策として UTF-8 BOM を付与する
    const csv = "﻿" + [header, ...rows].join("\n") + "\n";

    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="award-entries-${ymd}.csv"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/award-entries/export]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
