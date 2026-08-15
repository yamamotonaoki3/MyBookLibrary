"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

type FavoriteAuthor = { id: number; name: string };
type ReadingBook = {
  id: number;
  status: string;
  bookId: number;
  title: string;
  authorName: string;
};

type ProfileData = {
  name: string;
  favoriteAuthors: FavoriteAuthor[];
  readingBooks: ReadingBook[];
};

const STATUS_LABELS: Record<string, string> = {
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

type Props = {
  targetUserId: number;
  targetUserName: string;
};

export function FollowUserProfileModal({ targetUserId, targetUserName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileData | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !data && !loading) {
      setLoading(true);
      setError(null);
      fetch(`/api/users/${targetUserId}/favorite-authors`)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((json: ProfileData) => setData(json))
        .catch(() => setError("情報の取得に失敗しました。"))
        .finally(() => setLoading(false));
    }
  }

  return (
    <>
      <button
        onClick={() => handleOpenChange(true)}
        className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
      >
        プロフィールを見る
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <div className="mb-4 flex items-center justify-between">
            <DialogTitle>{targetUserName}さんのプロフィール</DialogTitle>
            <DialogClose
              aria-label="閉じる"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕
            </DialogClose>
          </div>

          {loading && <p className="text-sm text-zinc-500">読み込み中...</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {data && (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  お気に入り著者
                </h3>
                {data.favoriteAuthors.length === 0 ? (
                  <p className="text-sm text-zinc-500">お気に入り著者はまだ登録されていません。</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {data.favoriteAuthors.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        {f.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  読まれている本
                </h3>
                {data.readingBooks.length === 0 ? (
                  <p className="text-sm text-zinc-500">まだ本が登録されていません。</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.readingBooks.map((rb) => (
                      <li
                        key={rb.id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            rb.status === "read"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              : rb.status === "reading"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {STATUS_LABELS[rb.status] ?? rb.status}
                        </span>
                        <Link
                          href={`/books/${rb.bookId}`}
                          className="font-medium text-zinc-800 hover:underline dark:text-zinc-200"
                        >
                          {rb.title}
                        </Link>
                        <span className="ml-auto text-xs text-zinc-500">{rb.authorName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
