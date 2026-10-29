import { ExternalApiTimeoutError } from "@/lib/ExternalApiTimeoutError";
import { getAuthorBookCountNdl } from "@/lib/ndl";
import { logger } from "@/lib/logger";
import { anySignal, buildRequestSignal, type RequestOptions } from "@/lib/requestSignal";

// E2Eテストではローカルのスタブサーバーへ向ける（未指定時は本番エンドポイント）。
// 詳細は docs/test-dependency-map.md「外部APIへの配慮」を参照。
const RAKUTEN_API_BASE =
  process.env.RAKUTEN_API_BASE ??
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

/**
 * 楽天ブックスの API は、アプリ登録の「許可された Web サイト」のドメインからのリクエストだけを受け付け、
 * サーバー（Cloudflare Workers）からの呼び出しにも、そのドメインを Referer / Origin として求める（付けないと 403）。
 * RAKUTEN_ALLOWED_ORIGIN（Worker の vars。例: https://mybooklibrary.nyproducts.workers.dev）があれば付ける。
 * 未設定（ローカル開発・テスト・AWS）では、従来どおり何も付けない。
 */
function rakutenRequestHeaders(): Record<string, string> | undefined {
  const raw = process.env.RAKUTEN_ALLOWED_ORIGIN;
  if (!raw) return undefined;
  try {
    const origin = new URL(raw).origin;
    return { Referer: `${origin}/`, Origin: origin };
  } catch {
    return undefined;
  }
}

function getCredentials() {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId) throw new Error("RAKUTEN_APP_ID is not set");
  if (!accessKey) throw new Error("RAKUTEN_ACCESS_KEY is not set");
  return { appId, accessKey };
}

type RakutenSearchResponse = {
  Items?: RakutenBook[];
  pageCount?: number;
};

const RAKUTEN_MAX_ATTEMPTS = 3;

export type RakutenRequestOptions = RequestOptions & {
  /** リトライを含めた1回の呼び出し全体のタイムアウト（ms）。未指定なら無制限 */
  totalTimeoutMs?: number;
  /** 検索画面など、空の結果と時間切れを区別する呼び出し元だけ指定する。 */
  throwOnTimeout?: boolean;
};

/** signal が中断したら即座に解決する待機。 */
function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * 楽天APIへのfetchを、一時的な失敗（429・5xx等のres.ok=false、またはfetch・JSON本文読み取りの例外）に対して
 * リトライする共通ヘルパー。429は指数的に待機時間を伸ばして再試行し、それ以外の失敗
 * （5xxやネットワークエラー）は短い固定待機で再試行する。全て失敗した場合はnullを返す。
 * options 指定時は、1試行ごとのタイムアウト（timeoutMs）と、リトライ全体の上限
 * （totalTimeoutMs）・呼び出し元の中断（signal）を守る。全体の上限を超えたら再試行せずnullを返す。
 * throwOnTimeout が true の検索経路では、1試行・全体・呼び出し元の中断を例外にする。
 */
async function fetchRakutenWithRetry(url: string, options?: RakutenRequestOptions): Promise<RakutenSearchResponse | null> {
  const totalSignal = anySignal(
    options?.signal,
    options?.totalTimeoutMs !== undefined ? AbortSignal.timeout(options.totalTimeoutMs) : undefined
  );

  for (let attempt = 0; attempt < RAKUTEN_MAX_ATTEMPTS; attempt++) {
    if (totalSignal?.aborted) {
      if (options?.throwOnTimeout) throw new ExternalApiTimeoutError("楽天");
      return null;
    }
    const isLastAttempt = attempt >= RAKUTEN_MAX_ATTEMPTS - 1;

    let signal: AbortSignal | undefined;
    try {
      signal = buildRequestSignal({ signal: totalSignal, timeoutMs: options?.timeoutMs });
      const res = await fetch(url, {
        headers: rakutenRequestHeaders(),
        next: { revalidate: 3600 },
        signal,
      });

      if (res.status === 429) {
        if (!isLastAttempt) {
          await sleepUnlessAborted(1000 * (attempt + 1), totalSignal);
          continue;
        }
        logger.error("楽天API 429: リトライ上限に達しました");
        return null;
      }

      if (!res.ok) {
        if (!isLastAttempt) {
          await sleepUnlessAborted(500 * (attempt + 1), totalSignal);
          continue;
        }
        logger.error({ status: res.status, statusText: res.statusText }, "楽天API エラー: リトライ上限に達しました");
        return null;
      }

      return await res.json() as RakutenSearchResponse;
    } catch (err) {
      if (options?.throwOnTimeout && signal?.aborted) throw new ExternalApiTimeoutError("楽天");
      if (totalSignal?.aborted) return null;
      if (!isLastAttempt) {
        await sleepUnlessAborted(500 * (attempt + 1), totalSignal);
        continue;
      }
      logger.error({ err }, "楽天API 通信エラー: リトライ上限に達しました");
      return null;
    }
  }

  return null;
}

export async function fetchBookPage(params: {
  author?: string;
  title?: string;
  page: number;
  hits: number;
}, options?: RakutenRequestOptions): Promise<{ items: RakutenBook[]; pageCount: number }> {
  const { appId, accessKey } = getCredentials();

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("hits", String(params.hits));
  url.searchParams.set("page", String(params.page));

  if (params.author) url.searchParams.set("author", params.author);
  if (params.title) url.searchParams.set("title", params.title);

  const data = await fetchRakutenWithRetry(url.toString(), options);
  if (!data) return { items: [], pageCount: 0 };

  return {
    items: (data.Items ?? []) as RakutenBook[],
    pageCount: data.pageCount ?? 1,
  };
}

export async function searchBooks(params: {
  title?: string;
  author?: string;
  maxPages?: number;
  // タイトル+著者ごとに1件へ統合するか（既定true）。一括補完のように
  // 単行本・文庫など同一タイトル・著者の複数ISBNを別候補として見たい場合はfalseを指定する。
  dedupe?: boolean;
}, options?: RakutenRequestOptions): Promise<RakutenBook[]> {
  const { maxPages = 100, dedupe = true, ...fetchParams } = params;
  const signal = anySignal(
    options?.signal,
    options?.totalTimeoutMs !== undefined ? AbortSignal.timeout(options.totalTimeoutMs) : undefined
  );
  const pageOptions = { signal, timeoutMs: options?.timeoutMs };
  const { items, pageCount } = await fetchBookPage({ ...fetchParams, page: 1, hits: 30 }, pageOptions);

  if (pageCount <= 1) return dedupe ? deduplicateByTitle(items) : items;

  // 2ページ目以降を逐次取得（並列だと429 Too Many Requestsになるため）
  const allItems = [...items];
  const maxPage = Math.min(pageCount, maxPages);

  for (let page = 2; page <= maxPage; page++) {
    if (signal?.aborted) break;
    const { items: pageItems } = await fetchBookPage({ ...fetchParams, page, hits: 30 }, pageOptions);
    allItems.push(...pageItems);
  }

  return dedupe ? deduplicateByTitle(allItems) : allItems;
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, "").normalize("NFKC");
}

/**
 * 著者名の表記ゆれ（スペース有無・全半角）を吸収する。
 * 楽天・NDLの著者名には「氏名／著」「氏名 編」のような役割表記が付くことがあるため、
 * 末尾の役割表記も除去する（付与されていない氏名はそのまま変化しない）。
 */
export function normalizeAuthor(author: string): string {
  return author
    .trim()
    .replace(/\s+/g, "")
    .normalize("NFKC")
    .replace(/\/?(編著|編纂|編訳|監修|著|編|訳)$/, "");
}

function parseSalesDateForSort(salesDate: string): number {
  const match = salesDate.match(/(\d{4})年(\d{2})月(?:(\d{2})日)?/);
  if (!match) return Infinity;
  const [, year, month, day = "01"] = match;
  return new Date(`${year}-${month}-${day}`).getTime();
}

/** 読書管理の対象外となる形式（ムック・CD等）かどうか。
 * size が空の本はラノベ等の正規書籍が含まれるため除外しない。 */
export function isNonBookSize(size: string): boolean {
  return /ムック|カセット|CD|DVD|Blu-ray|ブルーレイ|カレンダー/i.test(size);
}

/** 形式の優先度（数値が小さいほど優先）: 単行本 > 新書 > 文庫 > その他 */
export function getSizePriority(size: string): number {
  if (/単行本|ハードカバー|上製本/.test(size)) return 1;
  if (/新書/.test(size)) return 2;
  if (/文庫/.test(size)) return 3;
  return 4;
}

/** タイトル＋著者で重複除去し、形式（単行本優先）→出版日（最古）の順で1冊を残す。
 * 著者もキーに含めるのは、同名タイトルの別作品（例：4作者の『青天』）を統合しないため。 */
export function deduplicateByTitle(books: RakutenBook[]): RakutenBook[] {
  const map = new Map<string, RakutenBook>();
  for (const book of books) {
    const key = `${normalizeTitle(book.title)}|${normalizeAuthor(book.author)}`;
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

  try {
    const res = await fetch(url.toString(), { headers: rakutenRequestHeaders(), next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const count = data.count ?? 0;
      if (count > 0) return count;
    }
  } catch {
    // fall through to NDL
  }

  return getAuthorBookCountNdl(authorName);
}

export async function searchBooksByIsbn(isbn: string, options?: RakutenRequestOptions): Promise<RakutenBook | null> {
  const { appId, accessKey } = getCredentials();

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("isbn", isbn);

  const data = await fetchRakutenWithRetry(url.toString(), options);
  if (!data) return null;

  const items = (data.Items ?? []) as RakutenBook[];
  return items[0] ?? null;
}
