const RAKUTEN_API_BASE =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";

export type RakutenBook = {
  title: string;
  author: string;
  largeImageUrl: string;
  publisherName: string;
  salesDate: string;
  isbn: string;
  size: string; // 例: "単行本", "文庫", "新書", ""
};

function getCredentials() {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId) throw new Error("RAKUTEN_APP_ID is not set");
  if (!accessKey) throw new Error("RAKUTEN_ACCESS_KEY is not set");
  return { appId, accessKey };
}

export async function fetchBookPage(params: {
  author?: string;
  title?: string;
  page: number;
  hits: number;
}): Promise<{ items: RakutenBook[]; pageCount: number }> {
  const { appId, accessKey } = getCredentials();

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("hits", String(params.hits));
  url.searchParams.set("page", String(params.page));

  if (params.author) url.searchParams.set("author", params.author);
  if (params.title) url.searchParams.set("title", params.title);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });

    if (res.status === 429) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error("楽天API 429: リトライ上限に達しました");
      return { items: [], pageCount: 0 };
    }

    if (!res.ok) {
      console.error(`楽天API エラー: ${res.status} ${res.statusText}`);
      return { items: [], pageCount: 0 };
    }

    const data = await res.json();
    return {
      items: (data.Items ?? []) as RakutenBook[],
      pageCount: data.pageCount ?? 1,
    };
  }

  return { items: [], pageCount: 0 };
}

export async function searchBooks(params: {
  title?: string;
  author?: string;
  maxPages?: number;
}): Promise<RakutenBook[]> {
  const { maxPages = 100, ...fetchParams } = params;
  const { items, pageCount } = await fetchBookPage({ ...fetchParams, page: 1, hits: 30 });

  if (pageCount <= 1) return deduplicateByTitle(items);

  // 2ページ目以降を逐次取得（並列だと429 Too Many Requestsになるため）
  const allItems = [...items];
  const maxPage = Math.min(pageCount, maxPages);

  for (let page = 2; page <= maxPage; page++) {
    const { items: pageItems } = await fetchBookPage({ ...fetchParams, page, hits: 30 });
    allItems.push(...pageItems);
  }

  return deduplicateByTitle(allItems);
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, "").normalize("NFKC");
}

function parseSalesDateForSort(salesDate: string): number {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return Infinity;
  const [, year, month, day = "01"] = match;
  return new Date(`${year}-${month}-${day}`).getTime();
}

/** 形式の優先度（数値が小さいほど優先）: 単行本 > 新書 > 文庫 > その他 */
function getSizePriority(size: string): number {
  if (/単行本|ハードカバー|上製本/.test(size)) return 1;
  if (/新書/.test(size)) return 2;
  if (/文庫/.test(size)) return 3;
  return 4;
}

/** タイトルで重複除去し、形式（単行本優先）→出版日（最古）の順で1冊を残す */
export function deduplicateByTitle(books: RakutenBook[]): RakutenBook[] {
  const map = new Map<string, RakutenBook>();
  for (const book of books) {
    const key = normalizeTitle(book.title);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, book);
      continue;
    }
    const newPriority = getSizePriority(book.size);
    const existingPriority = getSizePriority(existing.size);
    if (
      newPriority < existingPriority ||
      (newPriority === existingPriority &&
        parseSalesDateForSort(book.salesDate) < parseSalesDateForSort(existing.salesDate))
    ) {
      map.set(key, book);
    }
  }
  return Array.from(map.values());
}

export async function getAuthorBookCount(authorName: string): Promise<number> {
  const { appId, accessKey } = getCredentials();

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("hits", "1");
  url.searchParams.set("author", authorName);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return 0;

  const data = await res.json();
  return data.count ?? 0;
}

export async function searchBooksByIsbn(isbn: string): Promise<RakutenBook | null> {
  const { appId, accessKey } = getCredentials();

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("isbn", isbn);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data = await res.json();
  const items = (data.Items ?? []) as RakutenBook[];
  return items[0] ?? null;
}
