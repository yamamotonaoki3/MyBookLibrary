"use client";

import Link from "next/link";
import { ReadingStatusControls } from "@/frontend/readingStatus/ReadingStatusControls";
import { useReadingStatus, type ReadingStatusValue } from "@/frontend/readingStatus/useReadingStatus";

type Props = {
  book: {
    id: number;
    title: string;
    authorName: string;
    isbn: string | null;
    coverImageUrl: string | null;
    publishedAt: string;
  };
  initialStatus: ReadingStatusValue;
  hasReview: boolean;
};

export function ReadingStatusButtons({ book, initialStatus, hasReview }: Props) {
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

  return (
    <ReadingStatusControls
      status={status}
      busy={busy}
      busyMessage="保存中…"
      error={error}
      onChange={changeStatus}
      buttonClassName="px-3 py-1 text-sm"
    >
      {(status === "reading" || status === "read") && (
        hasReview ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
            感想投稿済み
          </span>
        ) : (
          <Link
            href={`/books/${book.id}/reviews/new`}
            className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            感想を書く
          </Link>
        )
      )}
    </ReadingStatusControls>
  );
}
