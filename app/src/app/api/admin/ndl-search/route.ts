import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/session";

const NDL_SRU_BASE = "https://ndlsearch.ndl.go.jp/api/sru";

export type NdlBook = {
  title: string;
  author: string;
  publisher: string;
  date: string;
  isbn: string;
};

function extractTag(xml: string, localName: string): string {
  const pattern = new RegExp(`<[^:/>\\s]*:?${localName}[^>]*>([^<]+)<\\/[^:/>\\s]*:?${localName}>`, "i");
  return xml.match(pattern)?.[1]?.trim() ?? "";
}

function extractAllTags(xml: string, localName: string): string[] {
  const pattern = new RegExp(`<[^:/>\\s]*:?${localName}[^>]*>([^<]+)<\\/[^:/>\\s]*:?${localName}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const val = match[1].trim();
    if (val) results.push(val);
  }
  return results;
}

function parseIsbn(identifiers: string[]): string {
  for (const id of identifiers) {
    const match = id.match(/(?:ISBN[-\s]?)?((?:97[89])[\d-]{10,})/i);
    if (match) return match[1].replace(/-/g, "");
  }
  return "";
}

function htmlDecode(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseDateForSort(date: string): number {
  // "2015.3" "2015-03" "2015" などの形式に対応
  const m = date.match(/(\d{4})[.\-\/]?(\d{0,2})/);
  if (!m) return Infinity;
  const year = parseInt(m[1]);
  const month = parseInt(m[2] || "0");
  return year * 100 + month;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, "").normalize("NFKC");
}

function parseRecords(xml: string): NdlBook[] {
  const recordRegex = /<(?:\w+:)?recordData>([\s\S]*?)<\/(?:\w+:)?recordData>/gi;
  const books: NdlBook[] = [];
  let match;

  while ((match = recordRegex.exec(xml)) !== null) {
    const rec = htmlDecode(match[1]);
    const title = extractTag(rec, "title");
    const author = extractTag(rec, "creator");
    const publisher = extractTag(rec, "publisher");
    const date = extractTag(rec, "date");
    const isbn = parseIsbn(extractAllTags(rec, "identifier"));

    if (!title || !isbn) continue;

    books.push({ title, author, publisher, date, isbn });
  }

  // 日付の古い順でソートし、同タイトルは最古の1件だけ残す
  books.sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
  const seen = new Set<string>();
  return books.filter((b) => {
    const key = normalizeTitle(b.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const { error } = await getAuthenticatedUserId();
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "キーワードを入力してください" }, { status: 400 });
  }

  // 全角スペースも半角スペースと同様に分割する
  const parts = q.split(/[\s　]+/);
  const titlePart = parts[0];
  const authorPart = parts.slice(1).join(" ");

  let query = `title="${titlePart}"`;
  if (authorPart) query += ` AND creator="${authorPart}"`;

  const params = new URLSearchParams({
    operation: "searchRetrieve",
    query,
    recordSchema: "dcndl",
    maximumRecords: "20",
    startRecord: "1",
  });

  try {
    const res = await fetch(`${NDL_SRU_BASE}?${params}`);
    if (!res.ok) throw new Error(`NDL API error: ${res.status}`);
    const xml = await res.text();
    return NextResponse.json(parseRecords(xml));
  } catch (err) {
    console.error("[GET /api/admin/ndl-search]", err);
    return NextResponse.json({ error: "国立国会図書館の検索に失敗しました" }, { status: 500 });
  }
}
