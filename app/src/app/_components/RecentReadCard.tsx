"use client";

import Link from "next/link";
import { useState } from "react";

type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";

type Props = {
  book: {
    id: number;
    title: string;
    authorName: string;
    isbn: string | null;
    coverImageUrl: string | null;
    publishedAt: string;
  };
  initialStatus: ReadingStatus;
  hasReview: boolean;
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

export function RecentReadCard({ book, initialStatus, hasReview }: Props) {
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: ReadingStatus) {
    setSaving(true);
    setStatus(newStatus);
    await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn,
        title: book.title,
        author: book.authorName,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.publishedAt,
        status: newStatus,
      }),
    });
    setSaving(false);
  }

  return (
    <li className="flex flex-col gap-1.5">
      <Link
        href={`/books/${book.id}`}
        className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
      >
        {book.title}
      </Link>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{book.authorName}</p>
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
        {hasReview ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
            感想投稿済み
          </span>
        ) : (
          <Link
            href={`/books/${book.id}/reviews/new`}
            className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            感想を書く
          </Link>
        )}
      </div>
    </li>
  );
}
