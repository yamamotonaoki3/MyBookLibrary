"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReadingStatusControls } from "@/frontend/readingStatus/ReadingStatusControls";
import { useReadingStatus } from "@/frontend/readingStatus/useReadingStatus";
import type { RecentRead } from "@/shared/dashboard";
import type { ReadingStatus } from "@/shared/readingStatus";

type Props = {
  book: RecentRead["book"];
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
  const { status, busy, error, changeStatus } = useReadingStatus({
    initialStatus,
    initialBookId: book.id,
    buildBody: () => ({
      isbn: book.isbn,
      title: book.title,
      author: book.authorName,
      coverImageUrl: book.coverImageUrl,
      publishedAt: book.publishedAt,
    }),
  });
  const [pendingStatus, setPendingStatus] = useState<ReadingStatus | null>(null);

  function handleStatusChange(newStatus: ReadingStatus) {
    if (newStatus === "unread" || newStatus === "want_to_read") {
      setPendingStatus(newStatus);
      return;
    }
    changeStatus(newStatus);
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
        onConfirm={() => { if (pendingStatus) changeStatus(pendingStatus); setPendingStatus(null); }}
      />
      <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
        <Link href={`/books/${book.id}`} className="text-sm font-medium leading-snug transition-colors hover:text-muted-foreground">
          {book.title}
        </Link>
        <p className="text-xs text-muted-foreground">{book.authorName}</p>
        <ReadingStatusControls
          status={status}
          busy={busy}
          busyMessage="保存中…"
          error={error}
          onChange={handleStatusChange}
          buttonClassName="px-2.5 py-0.5 text-xs"
        >
          {(status === "reading" || status === "read") && (hasReview ? (
            <Badge variant="secondary" className="shrink-0 rounded-full font-normal text-muted-foreground">感想投稿済み</Badge>
          ) : (
            <Link href={`/books/${book.id}/reviews/new`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs" })}>感想を書く</Link>
          ))}
        </ReadingStatusControls>
      </li>
    </>
  );
}
