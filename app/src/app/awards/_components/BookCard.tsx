"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { BookWithAwardEntry, ReadingStatus } from "@/types/award";

type Props = {
  entry: BookWithAwardEntry;
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  reading: "読書中",
  read: "読了",
};

export function BookCard({ entry }: Props) {
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
        isbn: null,
        title: book.title,
        author: book.author.name,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.publishedAt,
        status: newStatus,
      }),
    });
    setSaving(false);
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

      <div className="flex flex-1 flex-col justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
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
          </div>

          <Link href={`/books/${book.id}`}>
            <h3 className="font-semibold leading-tight text-zinc-900 hover:underline dark:text-zinc-50">
              {book.title}
            </h3>
          </Link>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {book.author.name}
          </p>
        </div>

        <div className="flex gap-1">
          {(["unread", "reading", "read"] as const).map((s) => (
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
                      : "bg-zinc-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
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
