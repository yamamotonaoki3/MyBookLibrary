"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import type { SearchResult } from "@/app/api/books/search/route";

type SearchType = "title" | "author";

export default function BookSearchPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchType>("title");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function fetchResults(q: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/books/search?q=${encodeURIComponent(q)}&type=${type}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "検索に失敗しました");
        setResults([]);
      } else {
        setResults(data.items);
      }
    } catch {
      setError("通信エラーが発生しました");
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => fetchResults(trimmed), 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await fetchResults(trimmed);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
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
              onChange={() => setType("title")}
            />
            タイトル
          </label>
          <label className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="type"
              value="author"
              checked={type === "author"}
              onChange={() => setType("author")}
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
            disabled={loading || !query.trim()}
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
            ? `${results.length} 件見つかりました`
            : "該当する本が見つかりませんでした"}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {results.map((book, i) => (
          <div
            key={book.isbn || i}
            className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded">
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
            <div className="flex flex-col justify-center gap-1">
              <h3 className="font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                {book.title}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {book.author}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {book.publisherName}
                {book.salesDate ? ` · ${book.salesDate}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
