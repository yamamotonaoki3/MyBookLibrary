"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthorBook } from "@/types/author";
import { LibraryAvailability } from "@/components/ui/library-availability";
import { ReadingStatusControls } from "@/frontend/readingStatus/ReadingStatusControls";
import { useReadingStatus } from "@/frontend/readingStatus/useReadingStatus";

type Props = {
  book: AuthorBook;
  canonicalAuthorName: string;
};

// リンク／ボタンのどちらでも同じ見た目・サイズになるよう、クラスを共通化する
const TITLE_CLASS =
  "block min-h-[2.5rem] text-left font-semibold text-gray-900 hover:underline dark:text-gray-100 line-clamp-2";

export function BookStatusCard({ book, canonicalAuthorName }: Props) {
  const router = useRouter();
  const { status, bookId: localBookId, busy, error, changeStatus } = useReadingStatus({
    initialStatus: book.status,
    initialBookId: book.bookId,
    buildBody: () => ({
      isbn: book.isbn,
      title: book.title,
      author: canonicalAuthorName,
      coverImageUrl: book.coverImageUrl,
      publishedAt: book.salesDate,
    }),
  });
  // 未登録の本は初回の保存中に楽天・NDL から本の情報を取得するため、完了まで時間がかかることがある
  const preparing = localBookId == null && busy;

  async function handleBookClick() {
    if (preparing) return;
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
    <div className="flex h-full gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {localBookId != null ? (
        <Link href={`/books/${localBookId}`} className="block flex-shrink-0">
          {coverImage}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleBookClick}
          disabled={preparing}
          aria-busy={preparing}
          className={`block flex-shrink-0 ${preparing ? "cursor-wait opacity-70" : "cursor-pointer"}`}
        >
          {coverImage}
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div>
          {localBookId != null ? (
            <Link
              href={`/books/${localBookId}`}
              className={TITLE_CLASS}
            >
              {book.title}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleBookClick}
              disabled={preparing}
              className={`${TITLE_CLASS} ${preparing ? "cursor-wait" : "cursor-pointer"}`}
            >
              {book.title}
            </button>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {book.publisherName}　{book.salesDate}
          </p>
          <div className="mt-1 flex min-h-[1.5rem] flex-wrap gap-1">
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
        </div>

        {book.isbn && (
          <div className="mt-1">
            <LibraryAvailability isbn={book.isbn} title={book.title} />
          </div>
        )}

        <ReadingStatusControls
          status={status}
          busy={busy}
          busyMessage={preparing ? "本の情報を取得中…" : "保存中…"}
          error={error}
          onChange={changeStatus}
          buttonClassName="px-3 py-1 text-xs"
        >
          {localBookId != null && (status === "reading" || status === "read") && (
            book.hasReview ? (
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                感想投稿済み
              </span>
            ) : (
              <Link
                href={`/books/${localBookId}/reviews/new`}
                className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                感想を書く
              </Link>
            )
          )}
        </ReadingStatusControls>
      </div>
    </div>
  );
}
