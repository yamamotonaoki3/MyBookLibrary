"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";

type Props = {
  book: {
    id: number;
    title: string;
    coverImageUrl: string | null;
    isbn: string | null;
    publishedAt: string;
    author: { name: string };
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

const STATUS_ACTIVE_COLORS: Record<ReadingStatus, string> = {
  unread: "bg-secondary-foreground text-secondary",
  want_to_read: "bg-orange-500 text-white",
  reading: "bg-blue-600 text-white",
  read: "bg-green-600 text-white",
};

export function BookCard({ book, initialStatus, hasReview }: Props) {
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [unreadDialogOpen, setUnreadDialogOpen] = useState(false);

  async function applyStatusChange(newStatus: ReadingStatus) {
    setSaving(true);
    setStatus(newStatus);
    await fetch("/api/reading-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isbn: book.isbn,
        title: book.title,
        author: book.author.name,
        coverImageUrl: book.coverImageUrl,
        publishedAt: book.publishedAt,
        status: newStatus,
      }),
    });
    setSaving(false);
  }

  function handleStatusChange(newStatus: ReadingStatus) {
    if (newStatus === "unread") {
      setUnreadDialogOpen(true);
      return;
    }
    applyStatusChange(newStatus);
  }

  return (
    <>
      <Card>
        <CardContent className="flex gap-4 p-4">
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
                <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground rounded">
                  No Image
                </div>
              )}
            </div>
          </Link>

          <div className="flex flex-1 flex-col justify-between gap-2">
            <div>
              <Link href={`/books/${book.id}`}>
                <h3 className="font-semibold leading-tight transition-colors hover:text-muted-foreground">
                  {book.title}
                </h3>
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {book.author.name}
              </p>
            </div>

            <div className="flex flex-wrap gap-1">
              {(["unread", "want_to_read", "reading", "read"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={saving}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    status === s ? STATUS_ACTIVE_COLORS[s] : STATUS_COLORS[s]
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
              {hasReview ? (
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
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={unreadDialogOpen}
        onOpenChange={setUnreadDialogOpen}
        title="未読に変更しますか？"
        description="未読に変更すると、この本一覧から削除されます。よろしいですか？"
        confirmLabel="未読にする"
        confirmVariant="default"
        onConfirm={() => applyStatusChange("unread")}
      />
    </>
  );
}
