const RAKUTEN_API_BASE = "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";

export type RakutenBook = {
  title: string;
  author: string;
  largeImageUrl: string;
  publisherName: string;
  salesDate: string;
};

export async function searchBookByTitle(title: string): Promise<RakutenBook | null> {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId) throw new Error("RAKUTEN_APP_ID is not set");
  if (!accessKey) throw new Error("RAKUTEN_ACCESS_KEY is not set");

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("title", title);
  url.searchParams.set("formatVersion", "2");

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error(`楽天API エラー: ${res.status} ${res.statusText}`);
    return null;
  }

  const data = await res.json();
  const items: RakutenBook[] = data.Items ?? [];

  if (items.length === 0) return null;
  return items[0];
}
