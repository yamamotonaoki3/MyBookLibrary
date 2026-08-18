import { searchBooks, getSizePriority, type RakutenBook } from "@/lib/rakuten";
import { searchBooksNdl, searchNdlPreferHardcover, searchNdlHardcoverCandidates } from "@/lib/ndl";
import { isPlausibleMatch } from "@/lib/matchUtils";

// 楽天・NDLとも実質的にQPS1程度が上限のため、呼び出し間に待機を挿入する。
// NDLサーチAPIの利用規約でも多重アクセス（同時並行アクセス）は避けるよう明記されている。
// bookEnrichmentWorker.ts側のフェーズ1a/1cでも同じ定数を使うため、ここに集約する。
export const NDL_WAIT_MS = 1100;
export const RAKUTEN_WAIT_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHardcoverSize(size: string): boolean {
  return getSizePriority(size) === 1;
}

export type EditionSource = "ndl_hardcover" | "rakuten_hardcover" | "fallback" | "ndl_fallback";

export type ResolvedEdition = {
  title: string;
  author: string;
  isbn: string;
  publisherName?: string;
  salesDate?: string;
  largeImageUrl?: string;
  source: EditionSource;
};

type EditionFallback = {
  title: string;
  author: string;
  isbn: string;
  publisherName?: string;
  salesDate?: string;
  largeImageUrl?: string;
};

/**
 * NDL単行本 → 楽天単行本 → 呼び出し元が渡したfallback → NDLの元データ、の優先順で
 * 「1件」の版情報を解決する。新規Book登録時（reading-status経路、books/isbn直指定）に、
 * 絶版等で楽天に単行本が無い場合でも可能な限り単行本を優先して登録するために使う。
 * 各ステップは独立してtry/catchし、外部APIの失敗が全体を失敗させない。
 */
export async function resolvePreferringHardcover(params: {
  title: string;
  author: string;
  fallback: EditionFallback;
}): Promise<ResolvedEdition> {
  const target = { title: params.title, author: params.author };

  // 1. NDL単行本
  try {
    const ndlHardcover = await searchNdlPreferHardcover(target);
    if (ndlHardcover?.isbn) {
      return {
        title: ndlHardcover.title,
        author: ndlHardcover.author,
        isbn: ndlHardcover.isbn,
        publisherName: ndlHardcover.publisherName,
        salesDate: ndlHardcover.salesDate,
        source: "ndl_hardcover",
      };
    }
  } catch {
    // 次のステップへフォールバック
  }

  // 2. 楽天単行本
  try {
    const rakutenResults = await searchBooks({ title: params.title, author: params.author, dedupe: false });
    const rakutenHardcover = rakutenResults
      .filter((r): r is RakutenBook & { isbn: string } => Boolean(r.isbn) && isPlausibleMatch(r, target) && isHardcoverSize(r.size))
      .sort((a, b) => getSizePriority(a.size) - getSizePriority(b.size))[0];
    if (rakutenHardcover) {
      return {
        title: rakutenHardcover.title,
        author: rakutenHardcover.author,
        isbn: rakutenHardcover.isbn,
        publisherName: rakutenHardcover.publisherName,
        salesDate: rakutenHardcover.salesDate,
        largeImageUrl: rakutenHardcover.largeImageUrl,
        source: "rakuten_hardcover",
      };
    }
  } catch {
    // 次のステップへフォールバック
  }

  // 3. fallback（呼び出し元が既に持っている候補）
  if (params.fallback.isbn) {
    return { ...params.fallback, source: "fallback" };
  }

  // 4. NDLの元データ（単行本判定なし、ISBNさえ取れれば採用）
  try {
    const { items } = await searchBooksNdl({ type: "titleAndAuthor", title: params.title, author: params.author, page: 1 });
    const ndlAny = items.find((item) => item.isbn && isPlausibleMatch(item, target));
    if (ndlAny?.isbn) {
      return {
        title: ndlAny.title,
        author: ndlAny.author,
        isbn: ndlAny.isbn,
        publisherName: ndlAny.publisherName,
        salesDate: ndlAny.salesDate,
        source: "ndl_fallback",
      };
    }
  } catch {
    // fallbackへ
  }

  return { ...params.fallback, source: "fallback" };
}

export type EditionCandidate = {
  title: string;
  author: string;
  isbn: string;
  isLikelyHardcover: boolean;
  origin: "ndl" | "rakuten";
};

/**
 * NDL単行本候補（重複排除なし）と楽天候補（dedupe:false）をマージして返す。
 * 一括補完機能向け：単行本・文庫を問わず複数のISBN候補をそのまま残し、
 * 管理者が確認・選択できるようにする（重複排除は同一ISBNのみで行う）。
 * NDL・楽天それぞれ1回ずつ呼び出すため、呼び出し後にQPS制御のsleepを行う。
 */
export async function collectEditionCandidates(params: {
  title: string;
  author: string;
}): Promise<EditionCandidate[]> {
  const target = { title: params.title, author: params.author };

  const ndlCandidates = await searchNdlHardcoverCandidates(target);
  await sleep(NDL_WAIT_MS);
  const rakutenResults = await searchBooks({ title: params.title, author: params.author, dedupe: false });
  await sleep(RAKUTEN_WAIT_MS);

  const merged: EditionCandidate[] = [];
  const seenIsbns = new Set<string>();

  for (const c of ndlCandidates) {
    if (!c.isbn || seenIsbns.has(c.isbn)) continue;
    seenIsbns.add(c.isbn);
    merged.push({ title: c.title, author: c.author, isbn: c.isbn, isLikelyHardcover: c.isLikelyHardcover, origin: "ndl" });
  }
  for (const r of rakutenResults) {
    if (!r.isbn || seenIsbns.has(r.isbn)) continue;
    if (!isPlausibleMatch({ title: r.title, author: r.author }, target)) continue;
    seenIsbns.add(r.isbn);
    merged.push({ title: r.title, author: r.author, isbn: r.isbn, isLikelyHardcover: isHardcoverSize(r.size), origin: "rakuten" });
  }
  return merged;
}
