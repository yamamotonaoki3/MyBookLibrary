"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Book = {
  id: number;
  title: string;
  author: { name: string };
  hasReview: boolean;
};

export function WriteReviewModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [body, setBody] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelectedBook(null);
    setBody("");
    setIsSpoiler(false);
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);
    try {
      const res = await fetch(
        `/api/books/reading?q=${encodeURIComponent(query.trim())}`
      );
      const data: Book[] = await res.json();
      setResults(data);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  async function handleSubmit() {
    if (!selectedBook || !body.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: selectedBook.id, body: body.trim(), isSpoiler }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "投稿に失敗しました");
      return;
    }
    closeModal();
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        感想を書く
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {selectedBook ? "感想を書く" : "本を選ぶ"}
              </h2>
              <button
                onClick={closeModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            {!selectedBook ? (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="タイトルを入力"
                    className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={loading || !query.trim()}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    検索
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  読書中・読了の本が候補に表示されます
                </p>

                {loading && (
                  <p className="mt-4 text-center text-sm text-zinc-500">検索中...</p>
                )}

                {!loading && searched && results.length === 0 && (
                  <p className="mt-4 text-center text-sm text-zinc-500">
                    該当する本が見つかりませんでした
                  </p>
                )}

                {!loading && results.length > 0 && (
                  <ul className="mt-4 max-h-64 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                    {results.map((book) => (
                      <li key={book.id}>
                        {book.hasReview ? (
                          <div className="flex items-center justify-between px-1 py-3">
                            <div>
                              <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
                                {book.title}
                              </p>
                              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                                {book.author.name}
                              </p>
                            </div>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">投稿済み</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedBook(book)}
                            className="w-full py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 px-1 rounded"
                          >
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                              {book.title}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {book.author.name}
                            </p>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedBook(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    ← 本を選び直す
                  </button>
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 line-clamp-1">
                    {selectedBook.title}
                  </span>
                </div>

                <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-500">
                  ※ 著者・作品に対する誹謗中傷が確認された場合、通報の対象となり削除されることがあります。
                </p>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  placeholder="感想を入力してください"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                />

                <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isSpoiler}
                    onChange={(e) => setIsSpoiler(e.target.checked)}
                    className="rounded"
                  />
                  ネタバレを含む
                </label>

                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={saving || !body.trim()}
                  className="mt-4 w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {saving ? "投稿中..." : "投稿する"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
