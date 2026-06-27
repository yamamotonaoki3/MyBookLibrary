"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthorBook } from "@/types/author";
import { LibraryAvailability } from "@/components/ui/library-availability";

type Props = {
  book: AuthorBook;
  canonicalAuthorName: string;
};

const STATUS_LABELS: Record<AuthorBook["status"], string> = {
  unread: "未読",
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

export function BookStatusCard({ book, canonicalAuthorName }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthorBook["status"]>(book.status);
  const [localBookId, setLocalBookId] = useState<number | null>(book.bookId);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: AuthorBook["status"]) {
    setSaving(true);
    setStatus(newStatus);
    const res = await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn,
        title: book.title,
        author: canonicalAuthorName,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.salesDate,
        status: newStatus,
      }),
    });
    const data = await res.json();
    if (data.bookId != null) setLocalBookId(data.bookId);
    setSaving(false);
    router.refresh();
  }

  async function handleBookClick() {
    const res = await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn,
        title: book.title,
        author: canonicalAuthorName,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.salesDate,
        status: "unread",
      }),
    });
    const data = await res.json();
    if (data.bookId != null) {
      router.push(`/books/${data.bookId}`);
    }
  }

  const coverImage = book.coverImageUrl ? (
    <Image
      src={book.coverImageUrl}
      alt={book.title}
      width={64}
      height={90}
      className="flex-shrink-0 rounded object-cover"
    />
  ) : (
    <div className="flex h-[90px] w-16 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400 dark:bg-gray-700">
      No Image
    </div>
  );

  return (
    <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {localBookId != null ? (
        <Link href={`/books/${localBookId}`} className="flex-shrink-0">
          {coverImage}
        </Link>
      ) : (
        <button onClick={handleBookClick} className="flex-shrink-0 cursor-pointer">
          {coverImage}
        </button>
      )}

      <div className="flex flex-1 flex-col justify-between gap-2">
        <div>
          {localBookId != null ? (
            <Link
              href={`/books/${localBookId}`}
              className="font-semibold text-gray-900 hover:underline dark:text-gray-100 line-clamp-2"
            >
              {book.title}
            </Link>
          ) : (
            <button
              onClick={handleBookClick}
              className="cursor-pointer text-left font-semibold text-gray-900 hover:underline dark:text-gray-100 line-clamp-2"
            >
              {book.title}
            </button>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {book.publisherName}　{book.salesDate}
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

        {book.isbn && (
          <div className="mt-1">
            <LibraryAvailability isbn={book.isbn} title={book.title} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(["unread", "want_to_read", "reading", "read"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={saving}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                status === s
                  ? s === "read"
                    ? "bg-green-600 text-white"
                    : s === "reading"
                      ? "bg-blue-600 text-white"
                      : s === "want_to_read"
                        ? "bg-orange-500 text-white"
                        : "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          {localBookId != null && (status === "reading" || status === "read") && (
            book.hasReview ? (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                感想投稿済み
              </span>
            ) : (
              <Link
                href={`/books/${localBookId}/reviews/new`}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
