import { logger } from "@/lib/logger";

// E2Eテストではローカルのスタブサーバーへ向ける（未指定時は本番エンドポイント）。
// 詳細は docs/test-dependency-map.md「外部APIへの配慮」を参照。
const NDL_API_BASE = process.env.NDL_API_BASE ?? "https://ndlsearch.ndl.go.jp/api/opensearch";
const NDL_SRU_BASE = process.env.NDL_SRU_BASE ?? "https://ndlsearch.ndl.go.jp/api/sru";
const HITS_PER_PAGE = 30;

export type NdlSearchBook = {
  title: string;
  author: string;
  isbn: string | null;
  publisherName: string;
  salesDate: string;
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

function parseIsbn(identifiers: string[]): string | null {
  for (const id of identifiers) {
    const match = id.match(/(?:ISBN[-\s]?)?((?:97[89])[\d-]{10,})/i);
    if (match) return match[1].replace(/-/g, "");
  }
  return null;
}

function htmlDecode(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, "").normalize("NFKC");
}

function formatNdlDate(raw: string): string {
  const m = raw.match(/(\d{4})[.\-\/]?(\d{0,2})/);
  if (!m) return raw;
  return m[2] ? `${m[1]}年${m[2].padStart(2, "0")}月` : `${m[1]}年`;
}

function parseNdlRecords(xml: string): NdlSearchBook[] {
  const recordRegex = /<(?:\w+:)?recordData>([\s\S]*?)<\/(?:\w+:)?recordData>/gi;
  const books: NdlSearchBook[] = [];
  let match;

  while ((match = recordRegex.exec(xml)) !== null) {
    const rec = htmlDecode(match[1]);
    const title = extractTag(rec, "title");
    if (!title) continue;
    const author = extractTag(rec, "creator");
    const publisher = extractTag(rec, "publisher");
    const date = extractTag(rec, "date");
    const isbn = parseIsbn(extractAllTags(rec, "identifier"));
    books.push({
      title,
      author,
      isbn,
      publisherName: publisher,
      salesDate: formatNdlDate(date),
    });
  }

  // タイトル正規化で重複排除（最初の1件を保持）
  const seen = new Set<string>();
  return books.filter((b) => {
    const key = normalizeTitleKey(b.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchBooksNdl(params: {
  type: "title" | "author" | "keyword";
  q: string;
  page: number;
}): Promise<{ items: NdlSearchBook[]; totalPages: number }> {
  let query: string;
  if (params.type === "author") {
    query = `creator="${params.q}"`;
  } else if (params.type === "keyword") {
    const parts = params.q.split(/[\s　]+/);
    query = `title="${parts[0]}"`;
    if (parts.length > 1) query += ` AND creator="${parts.slice(1).join(" ")}"`;
  } else {
    query = `title="${params.q}"`;
  }

  const startRecord = (params.page - 1) * HITS_PER_PAGE + 1;
  const urlParams = new URLSearchParams({
    operation: "searchRetrieve",
    query,
    recordSchema: "dcndl",
    maximumRecords: String(HITS_PER_PAGE),
    startRecord: String(startRecord),
  });

  try {
    const res = await fetch(`${NDL_SRU_BASE}?${urlParams}`);
    if (!res.ok) return { items: [], totalPages: 0 };
    const xml = await res.text();
    const totalMatch = xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    const totalPages = Math.ceil(total / HITS_PER_PAGE);
    const items = parseNdlRecords(xml);
    return { items, totalPages };
  } catch {
    return { items: [], totalPages: 0 };
  }
}

type NdlBook = {
  title: string;
  author: string;
  publisher: string;
  pubdate: string;
};

export async function searchBookByIsbn(isbn: string): Promise<NdlBook | null> {
  const url = new URL(NDL_API_BASE);
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    logger.error({ status: res.status, statusText: res.statusText }, "NDL API エラー");
    return null;
  }

  const xml = await res.text();

  // <title> から書名を抽出（" / 著者名" サフィックスを除去）
  const titleMatch = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/);
  if (!titleMatch) return null;
  const title = titleMatch[1].replace(/\s*\/.*$/, "").trim();

  // <dc:creator> から著者名を抽出・正規化
  const creatorMatch = xml.match(/<dc:creator>([^<]+)<\/dc:creator>/);
  let author = "";
  if (creatorMatch) {
    const raw = creatorMatch[1].trim();
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length >= 2 && /^\d{4}/.test(parts[parts.length - 1])) {
      author = parts.slice(0, -1).join(" ").replace(/\s+/g, "");
    } else {
      author = parts.join(" ").replace(/\s+/g, "");
    }
  }

  const publisherMatch = xml.match(/<dc:publisher>([^<]+)<\/dc:publisher>/);
  const publisher = publisherMatch ? publisherMatch[1].trim() : "";

  const pubdateMatch = xml.match(/<pubDate>([^<]+)<\/pubDate>/);
  const pubdate = pubdateMatch ? pubdateMatch[1].trim() : "";

  return { title, author, publisher, pubdate };
}

export async function getAuthorBookCountNdl(authorName: string): Promise<number> {
  const params = new URLSearchParams({
    operation: "searchRetrieve",
    query: `creator="${authorName}"`,
    recordSchema: "dcndl",
    maximumRecords: "1",
    startRecord: "1",
  });
  try {
    const res = await fetch(`${NDL_SRU_BASE}?${params}`);
    if (!res.ok) return 0;
    const xml = await res.text();
    const match = xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

export async function searchAuthorsByName(name: string): Promise<string[]> {
  const url = new URL(NDL_API_BASE);
  url.searchParams.set("creator", name);
  url.searchParams.set("cnt", "30");

  const res = await fetch(url.toString());
  if (!res.ok) {
    logger.error({ status: res.status, statusText: res.statusText }, "NDL API エラー");
    return [];
  }

  const xml = await res.text();

  // <dc:creator>東野, 圭吾, 1958-</dc:creator> から著者名部分を抽出
  const matches = xml.matchAll(/<dc:creator>([^<]+)<\/dc:creator>/g);
  const authors = new Set<string>();

  for (const match of matches) {
    const raw = match[1].trim();
    // "姓, 名, 生年" 形式を "姓名" に正規化（カンマ区切りの最初の2要素を結合）
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length >= 2 && /^\d{4}/.test(parts[parts.length - 1])) {
      // 末尾が生年の場合は除いて結合
      const nameParts = parts.slice(0, -1);
      authors.add(nameParts.join(" ").replace(/\s+/g, ""));
    } else {
      authors.add(parts.join(" ").replace(/\s+/g, ""));
    }
  }

  return [...authors];
}
