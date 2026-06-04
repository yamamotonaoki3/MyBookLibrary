const RAKUTEN_API_BASE =
  "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404";

export type RakutenBook = {
  title: string;
  author: string;
  largeImageUrl: string;
  publisherName: string;
  salesDate: string;
};

export async function searchBooks(params: {
  title?: string;
  author?: string;
}): Promise<RakutenBook[]> {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) throw new Error("RAKUTEN_APP_ID is not set");

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("formatVersion", "2");

  if (params.title) url.searchParams.set("title", params.title);
  if (params.author) url.searchParams.set("author", params.author);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error(`楽天API エラー: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  return (data.Items ?? []) as RakutenBook[];
}
