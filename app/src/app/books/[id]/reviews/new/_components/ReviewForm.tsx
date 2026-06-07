"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  bookId: number;
  bookTitle: string;
};

export default function ReviewForm({ bookId, bookTitle }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim() === "") {
      setError("感想を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, body, isSpoiler }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "送信に失敗しました。");
        return;
      }

      router.push(`/books/${bookId}`);
    } catch {
      setError("送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        感想を投稿する
      </h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        {bookTitle}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="body"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            感想
          </label>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            ※ 著者・作品に対する誹謗中傷が確認された場合、通報の対象となり削除されることがあります。
          </p>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="この本の感想を書いてください..."
            className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isSpoiler}
            onChange={(e) => setIsSpoiler(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-800 focus:ring-zinc-500 dark:border-zinc-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            ネタバレを含む
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "送信中..." : "投稿する"}
          </button>
          <Link
            href={`/books/${bookId}`}
            className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            キャンセル
          </Link>
        </div>
      </form>
    </div>
  );
}
