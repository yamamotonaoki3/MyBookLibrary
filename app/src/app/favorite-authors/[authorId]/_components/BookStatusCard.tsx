"use client";

import Image from "next/image";
import { useState } from "react";
import type { AuthorBook } from "@/types/author";

type Props = {
  book: AuthorBook;
  canonicalAuthorName: string;
};

const STATUS_LABELS: Record<AuthorBook["status"], string> = {
  unread: "未読",
  reading: "読書中",
  read: "読了",
};

export function BookStatusCard({ book, canonicalAuthorName }: Props) {
  const [status, setStatus] = useState<AuthorBook["status"]>(book.status);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: AuthorBook["status"]) {
    setSaving(true);
    setStatus(newStatus);
    await fetch("/api/reading-status", {
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
    setSaving(false);
  }

  return (
    <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {book.coverImageUrl ? (
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
      )}

      <div className="flex flex-1 flex-col justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
            {book.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {book.publisherName}　{book.salesDate}
          </p>
        </div>

        <div className="flex gap-2">
          {(["unread", "reading", "read"] as const).map((s) => (
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
                      : "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
