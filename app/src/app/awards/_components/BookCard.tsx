"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookWithAwardEntry, ReadingStatus } from "@/types/award";
import LibraryAvailabilityButton from "@/components/ui/LibraryAvailabilityButton";

type Props = {
  entry: BookWithAwardEntry;
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

export function BookCard({ entry }: Props) {
  const router = useRouter();
  const { book, type, year, status: initialStatus } = entry;
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: ReadingStatus) {
    setSaving(true);
    setStatus(newStatus);
    await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn ?? null,
        title: book.title,
        author: book.author.name,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.publishedAt,
        status: newStatus,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <Link href={`/books/${book.id}`} className="shrink-0">
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

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                type === "winner"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
              }`}
            >
              {type === "winner" ? "受賞" : "ノミネート"}
            </span>
            <span className="text-xs text-zinc-500">{year}年</span>
            {entry.awardName && (
              <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {entry.awardName}
              </span>
            )}
          </div>

          <Link href={`/books/${book.id}`}>
            <h3 className="break-words font-semibold leading-tight text-zinc-900 hover:underline dark:text-zinc-50">
              {book.title}
            </h3>
          </Link>
          <p className="mt-1 break-words text-sm text-zinc-500 dark:text-zinc-400">
            {book.author.name}
          </p>
        </div>

        <div className="mt-1">
          <LibraryAvailabilityButton bookId={book.id} bookTitle={book.title} />
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
          {(status === "reading" || status === "read") && (
            entry.hasReview ? (
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
            )
          )}
        </div>
      </div>
    </div>
  );
}
