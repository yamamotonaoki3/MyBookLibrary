"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

const STATUS_COLORS: Record<ReadingStatus, string> = {
  unread: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  want_to_read: "bg-orange-100 text-orange-700 hover:bg-orange-200",
  reading: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  read: "bg-green-100 text-green-700 hover:bg-green-200",
};

export function RecentReadCard({ book, initialStatus, hasReview }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ReadingStatus | null>(null);

  async function applyStatusChange(newStatus: ReadingStatus) {
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
    router.refresh();
  }

  function handleStatusChange(newStatus: ReadingStatus) {
    if (newStatus === "unread" || newStatus === "want_to_read") {
      setPendingStatus(newStatus);
      return;
    }
    applyStatusChange(newStatus);
  }

  return (
    <>
    <ConfirmDialog
      open={pendingStatus !== null}
      onOpenChange={(open) => { if (!open) setPendingStatus(null); }}
      title={`「${pendingStatus ? STATUS_LABELS[pendingStatus] : ""}」に変更しますか？`}
      description="このステータスに変更すると、最近の読書記録から除外されます。"
      confirmLabel="変更する"
      confirmVariant="default"
      onConfirm={() => { if (pendingStatus) applyStatusChange(pendingStatus); setPendingStatus(null); }}
    />
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <Link
        href={`/books/${book.id}`}
        className="text-sm font-medium leading-snug transition-colors hover:text-muted-foreground"
      >
        {book.title}
      </Link>
      <p className="text-xs text-muted-foreground">{book.authorName}</p>
      <div className="flex flex-wrap gap-1">
        {(["unread", "want_to_read", "reading", "read"] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            disabled={saving}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              status === s
                ? s === "read"
                  ? "bg-green-600 text-white"
                  : s === "reading"
                    ? "bg-blue-600 text-white"
                    : s === "want_to_read"
                      ? "bg-orange-500 text-white"
                      : "bg-secondary-foreground text-secondary"
                : STATUS_COLORS[s]
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
        {(status === "reading" || status === "read") && (
          hasReview ? (
            <Badge variant="secondary" className="rounded-full font-normal text-muted-foreground">
              感想投稿済み
            </Badge>
          ) : (
            <Link
              href={`/books/${book.id}/reviews/new`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "h-auto rounded-full px-2.5 py-0.5 text-xs" })}
            >
              感想を書く
            </Link>
          )
        )}
      </div>
    </li>
    </>
  );
}
