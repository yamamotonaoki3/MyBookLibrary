"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookSearchInput } from "@/app/_components/BookSearchInput";

type Book = {
  id: number;
  title: string;
  author: { name: string };
  hasReview: boolean;
};

export function WriteReviewModal() {
  const router = useRouter();
  const requestSequenceRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [body, setBody] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelectedBook(null);
    setBody("");
    setIsSpoiler(false);
    setIsPublic(true);
    setError(null);
    setOpen(true);
    fetchBooks("");
  }

  function closeModal() {
    requestSequenceRef.current += 1;
    setOpen(false);
  }

  async function fetchBooks(q: string) {
    const requestSequence = ++requestSequenceRef.current;
    setLoading(true);
    setSearched(false);
    try {
      const res = await fetch(`/api/books/reading?q=${encodeURIComponent(q)}`);
      const data: Book[] = await res.json();
      if (requestSequence === requestSequenceRef.current) {
        setResults(data);
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false);
        setSearched(true);
      }
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    await fetchBooks(query.trim());
  }

  const bodyLength = body.trim().length;
  const isBodyInvalid = bodyLength < 10 || bodyLength > 2000;

  async function handleSubmit() {
    if (!selectedBook || isBodyInvalid) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: selectedBook.id, body: body.trim(), isSpoiler, isPublic }),
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
        className="shrink-0 whitespace-nowrap rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
                <BookSearchInput
                  query={query}
                  onQueryChange={setQuery}
                  onSearch={handleSearch}
                  loading={loading}
                  disabled={!query.trim()}
                  placeholder="タイトルを入力"
                />
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
                  placeholder="感想を入力してください...（10文字以上2000文字以内）"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                />
                <p className={`text-right text-xs ${bodyLength > 2000 ? "text-red-500" : "text-zinc-400 dark:text-zinc-500"}`}>
                  {bodyLength} / 2000
                </p>

                <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isSpoiler}
                    onChange={(e) => setIsSpoiler(e.target.checked)}
                    className="rounded"
                  />
                  ネタバレを含む
                </label>

                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="rounded"
                    />
                    全体に公開する
                  </label>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    ※ 公開した感想は他のユーザーも閲覧できます。チェックを外すと自分のみ閲覧できます。
                  </p>
                </div>

                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={saving || isBodyInvalid || !selectedBook}
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
