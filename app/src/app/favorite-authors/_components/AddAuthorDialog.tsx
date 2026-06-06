"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthorSearchResult } from "@/types/author";

export function AddAuthorDialog() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthorSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  function openDialog() {
    setQuery("");
    setResults([]);
    setSearched(false);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSearch() {
    if (!query.trim()) return;
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
    await fetch("/api/favorite-authors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName: name }),
    });
    router.refresh();
    closeDialog();
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        著者を追加
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-black/50"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">著者を追加</h2>
            <button
              onClick={closeDialog}
              className="text-gray-400 hover:text-gray-600"
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
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              検索
            </button>
          </div>

          {loading && (
            <p className="text-center text-sm text-gray-500">検索中...</p>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="text-center text-sm text-gray-500">
              著者が見つかりませんでした
            </p>
          )}

          {!loading && results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100">
              {results.map((author) => (
                <li
                  key={author.name}
                  className="flex items-center justify-between py-3"
                >
                  <p
                    className={`text-sm font-medium ${author.isFavorite ? "text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
                  >
                    {author.name}
                  </p>
                  {author.isFavorite ? (
                    <span className="text-xs text-gray-400">登録済み</span>
                  ) : (
                    <button
                      onClick={() => handleAdd(author.name)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      追加
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
