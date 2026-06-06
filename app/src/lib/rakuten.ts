const RAKUTEN_API_BASE =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";

export type RakutenBook = {
  title: string;
  author: string;
  largeImageUrl: string;
  publisherName: string;
  salesDate: string;
  isbn: string;
};

function getCredentials() {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId) throw new Error("RAKUTEN_APP_ID is not set");
  if (!accessKey) throw new Error("RAKUTEN_ACCESS_KEY is not set");
  return { appId, accessKey };
}

async function fetchBookPage(params: {
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

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  });
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

export async function searchBooks(params: {
  title?: string;
  author?: string;
}): Promise<RakutenBook[]> {
  const { items, pageCount } = await fetchBookPage({ ...params, page: 1, hits: 30 });

  if (pageCount <= 1) return deduplicateByTitle(items);

  // 2ページ目以降を逐次取得（並列だと429 Too Many Requestsになるため）
  const allItems = [...items];
  const maxPage = Math.min(pageCount, 100);

  for (let page = 2; page <= maxPage; page++) {
    const { items: pageItems } = await fetchBookPage({ ...params, page, hits: 30 });
    allItems.push(...pageItems);
  }

  return deduplicateByTitle(allItems);
}

/** タイトルで重複除去し、最初に登場したものを残す */
export function deduplicateByTitle(books: RakutenBook[]): RakutenBook[] {
  const seen = new Set<string>();
  return books.filter((book) => {
    if (seen.has(book.title)) return false;
    seen.add(book.title);
    return true;
  });
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
