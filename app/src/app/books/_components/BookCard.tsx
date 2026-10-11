"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LibraryAvailability } from "@/components/ui/library-availability";
import { ReadingStatusControls } from "@/frontend/readingStatus/ReadingStatusControls";
import { useReadingStatus, type ReadingStatusValue } from "@/frontend/readingStatus/useReadingStatus";

type ReadingStatus = ReadingStatusValue;

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

export function BookCard({ book, initialStatus, hasReview }: Props) {
  const { status, busy, error, changeStatus } = useReadingStatus({
    initialStatus,
    initialBookId: book.id,
    buildBody: () => ({
      isbn: book.isbn,
      title: book.title,
      author: book.author.name,
      coverImageUrl: book.coverImageUrl,
      publishedAt: book.publishedAt,
    }),
  });
  const [unreadDialogOpen, setUnreadDialogOpen] = useState(false);

  function handleStatusChange(newStatus: ReadingStatus) {
    if (newStatus === "unread") {
      setUnreadDialogOpen(true);
      return;
    }
    changeStatus(newStatus);
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

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
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

            {book.isbn && (
              <div className="mt-1">
                <LibraryAvailability isbn={book.isbn} title={book.title} />
              </div>
            )}

            <ReadingStatusControls
              status={status}
              busy={busy}
              busyMessage="保存中…"
              error={error}
              onChange={handleStatusChange}
              buttonClassName="px-2.5 py-0.5 text-xs"
            >
              {(status === "reading" || status === "read") && (
                hasReview ? (
                  <Badge variant="secondary" className="shrink-0 rounded-full font-normal text-muted-foreground">
                    感想投稿済み
                  </Badge>
                ) : (
                  <Link
                    href={`/books/${book.id}/reviews/new`}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "h-auto shrink-0 rounded-full px-2.5 py-0.5 text-xs" })}
                  >
                    感想を書く
                  </Link>
                )
              )}
            </ReadingStatusControls>
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
        onConfirm={() => changeStatus("unread")}
      />
    </>
  );
}
