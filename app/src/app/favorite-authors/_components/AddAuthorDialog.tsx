"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthorSearchResult } from "@/types/author";

export function AddAuthorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthorSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function openDialog() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setAddError(null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  const queryLength = query.trim().length;

  async function handleSearch() {
    if (queryLength < 2) return;
    setLoading(true);
    setSearched(false);
    try {
      const res = await fetch(
        `/api/authors/search?q=${encodeURIComponent(query.trim())}`
      );
      const data: AuthorSearchResult[] = await res.json();
      setResults(data);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  async function handleAdd(name: string) {
    setAddError(null);
    const res = await fetch("/api/favorite-authors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName: name }),
    });
    if (!res.ok) {
      const data = await res.json();
      setAddError(data.error ?? "追加に失敗しました。");
      return;
    }
    router.refresh();
    closeDialog();
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="shrink-0 whitespace-nowrap rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        著者を追加
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                著者を追加
              </h2>
              <button
                onClick={closeDialog}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="例：東野圭吾、湊かなえ"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                onClick={handleSearch}
                disabled={loading || queryLength < 2}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                検索
              </button>
            </div>
            {query.trim().length > 0 && queryLength < 2 && (
              <p className="mt-1.5 text-xs text-red-500">2文字以上入力してください。</p>
            )}
            {addError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p>
            )}

            {loading && (
              <p className="mt-4 text-center text-sm text-zinc-500">検索中...</p>
            )}

            {!loading && searched && results.length === 0 && (
              <p className="mt-4 text-center text-sm text-zinc-500">
                著者が見つかりませんでした
              </p>
            )}

            {!loading && results.length > 0 && (
              <ul className="mt-4 max-h-72 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {results.map((author) => (
                  <li
                    key={author.name}
                    className="flex items-center justify-between py-3"
                  >
                    <p
                      className={`text-sm font-medium ${author.isFavorite ? "text-zinc-400" : "text-zinc-900 dark:text-zinc-50"}`}
                    >
                      {author.name}
                    </p>
                    {author.isFavorite ? (
                      <span className="text-xs text-zinc-400">登録済み</span>
                    ) : (
                      <button
                        onClick={() => handleAdd(author.name)}
                        className="rounded px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800"
                      >
                        追加
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
