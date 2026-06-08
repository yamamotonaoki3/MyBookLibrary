"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SearchResult, SearchResponse } from "@/app/api/books/search/route";

type SearchType = "title" | "author";
type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";

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
        href={book.isbn ? `/books/isbn/${book.isbn}` : "#"}
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
          <Link href={book.isbn ? `/books/isbn/${book.isbn}` : "#"}>
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
          {book.awards.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
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
          )}
        </div>

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
  const urlPage = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [query, setQuery] = useState(urlQ);
  const [type, setType] = useState<SearchType>(urlType);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchResults = useCallback(async (q: string, t: SearchType, page: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/books/search?q=${encodeURIComponent(q)}&type=${t}&page=${page}`
      );
      const data: SearchResponse = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "検索に失敗しました");
        setResults([]);
        setTotalPages(0);
      } else {
        setResults(data.items);
        setTotalPages(data.totalPages);
      }
    } catch {
      setError("通信エラーが発生しました");
      setResults([]);
      setTotalPages(0);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  // URL パラメータが変わったら検索実行
  useEffect(() => {
    if (urlQ.trim().length >= 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchResults(urlQ, urlType, urlPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ, urlType, urlPage]);

  function pushUrl(q: string, t: SearchType, page: number) {
    const params = new URLSearchParams({ q, type: t, page: String(page) });
    router.push(`/books/search?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    pushUrl(trimmed, type, 1);
  }

  function handleTypeChange(newType: SearchType) {
    setType(newType);
    const trimmed = query.trim();
    if (trimmed.length >= 2 && searched) {
      pushUrl(trimmed, newType, 1);
    }
  }

  function handlePageChange(page: number) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    pushUrl(urlQ, urlType, page);
  }

  return (
    <div className="flex flex-col px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="mb-5 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        本を探す
      </h1>

      <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3">
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
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          検索にヒットしない場合は、正式なタイトルや著者名（漢字）でお試しください。
        </p>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {searched && !loading && !error && (
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          {results.length > 0
            ? `${results.length} 件表示中`
            : "該当する本が見つかりませんでした"}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((book, i) => (
          <SearchResultCard key={book.isbn || i} book={book} />
        ))}
      </div>

      {/* ページング UI */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={() => handlePageChange(urlPage - 1)}
            disabled={urlPage <= 1 || loading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← 前へ
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {urlPage} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(urlPage + 1)}
            disabled={urlPage >= totalPages || loading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            次へ →
          </button>
        </div>
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
