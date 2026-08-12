"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SearchResult, SearchResponse } from "@/app/api/books/search/route";
import BarcodeScannerModal from "./_components/BarcodeScannerModal";
import ManualBookRegisterModal from "./_components/ManualBookRegisterModal";
import { LibraryAvailability } from "@/components/ui/library-availability";

type SearchType = "title" | "author";
type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";

// クライアント側でもサーバーのレート制限（500ms間隔）と衝突しないよう
// 追加読み込みの最低間隔を設ける（サーバー側より少し余裕を持たせる）
const CLIENT_MIN_FETCH_INTERVAL_MS = 600;

// 無限スクロールで結果を連結する際の重複除去キー。サーバー側の重複除去は
// ページ単位で行われるため、ページを跨いで同じ本（ISBN、ISBNがない場合は
// タイトル＋著者）が別ページに出現すると連結時に重複しうる
function dedupeKey(book: SearchResult): string {
  return book.isbn ? `isbn:${book.isbn}` : `title-author:${book.title}::${book.author}`;
}

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

function SearchResultCard({ book }: { book: SearchResult }) {
  const router = useRouter();
  const [status, setStatus] = useState<ReadingStatus>((book.status as ReadingStatus) ?? "unread");
  const [saving, setSaving] = useState(false);
  const [bookId, setBookId] = useState<number | null>(null);

  async function handleStatusChange(newStatus: ReadingStatus) {
    setSaving(true);
    setStatus(newStatus);
    const res = await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.salesDate,
        status: newStatus,
      }),
    });
    const data = await res.json();
    if (data.bookId) setBookId(data.bookId);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <Link
        href={book.id ? `/books/${book.id}` : book.isbn ? `/books/isbn/${book.isbn}` : "#"}
        className="shrink-0"
      >
        <div className="relative h-32 w-20 overflow-hidden rounded">
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt={`${book.title}の書影`}
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
              No Image
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col justify-between gap-2">
        <div>
          <Link href={book.id ? `/books/${book.id}` : book.isbn ? `/books/isbn/${book.isbn}` : "#"}>
            <h3 className="font-semibold leading-tight text-zinc-900 hover:underline dark:text-zinc-50">
              {book.title}
            </h3>
          </Link>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {book.author}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {book.publisherName}
            {book.salesDate ? ` · ${book.salesDate}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {book.source === "manual" && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                手動登録
              </span>
            )}
            {book.awards.map((award) => (
              <span
                key={`${award.name}-${award.year}`}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  award.type === "winner"
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                {award.type === "winner" ? "受賞" : "ノミネート"}　{award.name}
              </span>
            ))}
          </div>
        </div>

        {book.isbn && (
          <div className="mt-1 mb-1">
            <LibraryAvailability isbn={book.isbn} title={book.title} />
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {(["unread", "want_to_read", "reading", "read"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={saving}
              className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                status === s
                  ? s === "read"
                    ? "bg-green-600 text-white"
                    : s === "reading"
                      ? "bg-blue-600 text-white"
                      : s === "want_to_read"
                        ? "bg-orange-500 text-white"
                        : "bg-zinc-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          {bookId != null && (status === "reading" || status === "read") && (
            <Link
              href={`/books/${bookId}/reviews/new`}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              感想を書く
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function BookSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQ = searchParams.get("q") ?? "";
  const urlType = (searchParams.get("type") ?? "title") as SearchType;

  const [query, setQuery] = useState(urlQ);
  const [type, setType] = useState<SearchType>(urlType);
  const [results, setResults] = useState<SearchResult[]>([]);
  // 直近まで読み込んだページ番号（0=未読込）。無限スクロールで次に取得するのは loadedPage + 1
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualRegisterOpen, setManualRegisterOpen] = useState(false);
  const [registeringIsbn, setRegisteringIsbn] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 検索条件変更時にインクリメントする世代カウンタ。
  // 進行中の古いリクエストのレスポンスが新しい検索結果に混ざるのを防ぐ。
  const requestTokenRef = useRef(0);
  // サーバー側レート制限（500ms間隔）と衝突しないよう、初回検索・追加読み込みを
  // 問わずリクエスト送信前に直近リクエストからの間隔を保証する。
  // 「次に送信可能な予約時刻」として管理することで、検索条件が短時間に
  // 複数回変わり fetchPage が同時に呼ばれても、それぞれ別の送信時刻に
  // 直列化される（単純な経過時間チェックだと同時に待機に入り、待機明けに
  // 同時送信されてサーバー側の制限に引っかかってしまうため）
  const nextAllowedAtRef = useRef(0);
  // 無限スクロールで結果を連結する際の重複除去用（dedupeKey参照）
  const seenKeysRef = useRef<Set<string>>(new Set());

  const hasMore = totalPages > 0 && loadedPage < totalPages;

  // seenKeysRef への書き込み（副作用）を伴うため、setState の updater 関数の
  // 外側で1回だけ呼ぶこと。React StrictMode は updater 関数を検証のため2回
  // 呼び出すため、ここに副作用を持たせると1回目で全キーが登録され、2回目の
  // 呼び出し（Reactが採用する方）で全件「既出」と判定され結果が失われる。
  const pickUniqueItems = useCallback((incoming: SearchResult[]): SearchResult[] => {
    const uniqueItems: SearchResult[] = [];
    for (const book of incoming) {
      const key = dedupeKey(book);
      if (seenKeysRef.current.has(key)) continue;
      seenKeysRef.current.add(key);
      uniqueItems.push(book);
    }
    return uniqueItems;
  }, []);

  const fetchPage = useCallback(async (q: string, t: SearchType, page: number) => {
    const now = Date.now();
    const reservedAt = Math.max(now, nextAllowedAtRef.current);
    nextAllowedAtRef.current = reservedAt + CLIENT_MIN_FETCH_INTERVAL_MS;
    const delay = reservedAt - now;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const res = await fetch(
      `/api/books/search?q=${encodeURIComponent(q)}&type=${t}&page=${page}`
    );
    const data: SearchResponse = await res.json();
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? "検索に失敗しました");
    }
    return data;
  }, []);

  // 検索条件が変わったときの初回検索（1ページ目から取得し直す）
  const fetchInitial = useCallback(async (q: string, t: SearchType) => {
    // 新しい検索を開始するので世代を進め、進行中の古い fetchMore の結果を無効化する。
    // 古い fetchMore が完了していなくても loadingMore を明示的に解除しないと、
    // 新しい検索後の自動読み込みがガード条件（loadingMore）でブロックされ続けてしまう
    const token = ++requestTokenRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setMoreError(null);
    seenKeysRef.current = new Set();
    try {
      const data = await fetchPage(q, t, 1);
      if (token !== requestTokenRef.current) return;
      const uniqueItems = pickUniqueItems(data.items);
      setResults(uniqueItems);
      setTotalPages(data.totalPages);
      setLoadedPage(1);
    } catch (e) {
      if (token !== requestTokenRef.current) return;
      setError(e instanceof Error ? e.message : "通信エラーが発生しました");
      setResults([]);
      setTotalPages(0);
      setLoadedPage(0);
    } finally {
      if (token === requestTokenRef.current) {
        setLoading(false);
        setSearched(true);
      }
    }
  }, [fetchPage, pickUniqueItems]);

  // スクロールで末尾に到達したときの追加読み込み。
  // force が true の場合のみ、直前のエラー（moreError）があっても実行する
  // （sentinelが画面内に留まったまま自動リトライが無限に走るのを防ぎ、
  // 再試行はユーザー操作からのみ行えるようにするため）
  const fetchMore = useCallback(async (opts?: { force?: boolean }) => {
    if (loading || loadingMore || !hasMore) return;
    if (moreError && !opts?.force) return;
    const token = requestTokenRef.current;
    setLoadingMore(true);
    setMoreError(null);
    const nextPage = loadedPage + 1;
    try {
      const data = await fetchPage(urlQ, urlType, nextPage);
      if (token !== requestTokenRef.current) return;
      const uniqueItems = pickUniqueItems(data.items);
      setResults((prev) => [...prev, ...uniqueItems]);
      setTotalPages(data.totalPages);
      setLoadedPage(nextPage);
    } catch (e) {
      if (token !== requestTokenRef.current) return;
      setMoreError(e instanceof Error ? e.message : "通信エラーが発生しました");
    } finally {
      // 検索条件が変わっていた場合、この古いリクエストの完了で
      // 新しいリクエストの loadingMore を誤って解除しないようにする
      if (token === requestTokenRef.current) {
        setLoadingMore(false);
      }
    }
  }, [loading, loadingMore, hasMore, moreError, loadedPage, urlQ, urlType, fetchPage, pickUniqueItems]);

  // URL パラメータ（検索条件）が変わったら1ページ目から検索し直す
  useEffect(() => {
    if (urlQ.trim().length >= 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchInitial(urlQ, urlType);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ, urlType]);

  // 末尾のsentinel要素が画面に入ったら次ページを自動取得する
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchMore();
        }
      },
      { rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, fetchMore]);

  function pushUrl(q: string, t: SearchType) {
    const params = new URLSearchParams({ q, type: t });
    router.push(`/books/search?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 1) return;
    pushUrl(trimmed, type);
  }

  function handleTypeChange(newType: SearchType) {
    setType(newType);
    const trimmed = query.trim();
    if (trimmed.length >= 1 && searched) {
      pushUrl(trimmed, newType);
    }
  }

  async function handleIsbnScanned(isbn: string) {
    setRegisteringIsbn(true);
    setRegisterMessage(null);
    try {
      const bookRes = await fetch(`/api/books/isbn?isbn=${encodeURIComponent(isbn)}`);
      if (!bookRes.ok) {
        const data = await bookRes.json();
        setRegisterMessage({ type: "error", text: data.error ?? "本が見つかりませんでした" });
        return;
      }
      const book = await bookRes.json();

      if (book.currentStatus === "reading") {
        setRegisterMessage({ type: "error", text: `「${book.title}」はすでに読書中として登録されています` });
        return;
      }

      const registerRes = await fetch("/api/reading-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          coverImageUrl: book.coverImageUrl,
          publishedAt: book.salesDate,
          status: "reading",
        }),
      });
      if (!registerRes.ok) {
        setRegisterMessage({ type: "error", text: "登録に失敗しました" });
        return;
      }
      setRegisterMessage({ type: "success", text: `「${book.title}」を読書中として登録しました` });
      router.refresh();
    } catch {
      setRegisterMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setRegisteringIsbn(false);
    }
  }

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-wrap shrink-0 items-center justify-between gap-2 lg:mb-6">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          本を探す
        </h1>
        <button
          type="button"
          onClick={() => { setRegisterMessage(null); setScannerOpen(true); }}
          disabled={registeringIsbn}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          {registeringIsbn ? "登録中…" : "バーコードで登録"}
        </button>
      </div>

      {registerMessage && (
        <div
          className={`mb-4 shrink-0 rounded-lg px-4 py-3 text-sm ${
            registerMessage.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {registerMessage.text}
        </div>
      )}

      <form onSubmit={handleSearch} className="mb-6 shrink-0 flex max-w-2xl flex-col gap-3">
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="type"
              value="title"
              checked={type === "title"}
              onChange={() => handleTypeChange("title")}
            />
            タイトル
          </label>
          <label className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="type"
              value="author"
              checked={type === "author"}
              onChange={() => handleTypeChange("author")}
            />
            著者名
          </label>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={type === "title" ? "タイトルを入力（例：吾輩は猫である）" : "著者名を入力（例：夏目漱石）"}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 1}
            className="shrink-0 whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          検索にヒットしない場合は、正式なタイトルや著者名（漢字）でお試しください。
        </p>
      </form>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        {searched && !loading && !error && results.length > 0 && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            {results.length} 件表示中
          </p>
        )}

        {searched && !loading && !error && results.length === 0 && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-6 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              該当する本が見つかりませんでした
            </p>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              タイトルや著者名を変えて再検索するか、手動で登録してください。
            </p>
            <button
              type="button"
              onClick={() => { setRegisterMessage(null); setManualRegisterOpen(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              手動で登録する
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {results.map((book, i) => (
            <SearchResultCard key={book.isbn || i} book={book} />
          ))}
        </div>

        {/* 無限スクロール用の監視要素。画面に入ると次ページを自動取得する */}
        {hasMore && (
          <div ref={sentinelRef} className="mt-8 flex justify-center py-4">
            {loadingMore && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
            )}
          </div>
        )}

        {moreError && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="text-center text-sm text-red-600 dark:text-red-400">
              {moreError}
            </p>
            <button
              type="button"
              onClick={() => fetchMore({ force: true })}
              className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              再試行
            </button>
          </div>
        )}
      </div>

      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onScanned={handleIsbnScanned}
        />
      )}

      {manualRegisterOpen && (
        <ManualBookRegisterModal
          onClose={() => setManualRegisterOpen(false)}
          onRegistered={(message) => {
            setRegisterMessage({ type: "success", text: message });
          }}
        />
      )}
    </div>
  );
}

export default function BookSearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-500">読み込み中...</div>}>
      <BookSearchContent />
    </Suspense>
  );
}
