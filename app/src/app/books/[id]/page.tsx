import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { searchBooks } from "@/lib/rakuten";
import type { Metadata } from "next";
import LikeButton from "./_components/LikeButton";
import FavoriteAuthorButton from "@/app/books/_components/FavoriteAuthorButton";
import { ReadingStatusButtons } from "./_components/ReadingStatusButtons";
import { ReportButton } from "./_components/ReportButton";
import EditBookButton from "./_components/EditBookButton";
import LibraryAvailabilityButton from "./_components/LibraryAvailabilityButton";
import FollowButton from "@/app/_components/FollowButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id: Number(id) },
    select: { title: true },
  });
  return { title: book ? `${book.title} | MyBookLibrary` : "Not Found" };
}

export default async function BookDetailPage({ params }: Props) {
  const session = await auth();
  const userId = Number(session!.user.id);
  const { id } = await params;
  const bookId = Number(id);

  if (isNaN(bookId)) notFound();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      author: true,
      awardEntries: {
        include: { award: true },
        orderBy: { year: "desc" },
      },
      reviews: {
        where: {
          OR: [{ isPublic: true }, { userId: userId }],
        },
        include: {
          user: { select: { name: true, id: true } },
          _count: { select: { likes: true } },
          likes: {
            where: { userId: userId },
            select: { id: true },
          },
          reports: {
            where: { userId: userId },
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!book) notFound();

  const followingRecords = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = new Set(followingRecords.map((f) => f.followingId));

  const [favoriteRecord, readingStatusRecord, reviewRecord] = await Promise.all([
    prisma.favoriteAuthor.findUnique({
      where: { userId_authorId: { userId: userId, authorId: book.authorId } },
      select: { authorId: true },
    }),
    prisma.readingStatus.findUnique({
      where: { userId_bookId: { userId: userId, bookId } },
      select: { status: true },
    }),
    prisma.review.findFirst({
      where: { userId: userId, bookId },
      select: { id: true },
    }),
  ]);

  type ReadingStatus = "unread" | "want_to_read" | "reading" | "read";
  const currentStatus = (readingStatusRecord?.status ?? "unread") as ReadingStatus;
  const hasReview = reviewRecord !== null;

  const buildPublishedLabel = (d: Date): string =>
    d.getDate() !== 1
      ? `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`
      : `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月`;

  const normalizeTitle = (t: string) => t.trim().replace(/\s+/g, "").normalize("NFKC");
  const authorBooks = await searchBooks({ author: book.author.name, maxPages: 5 });
  const matched = authorBooks.find(
    (b) => normalizeTitle(b.title) === normalizeTitle(book.title)
  );
  const publishedLabel = matched?.salesDate ?? buildPublishedLabel(book.publishedAt);

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
    <div className="flex-1 overflow-y-auto">
      {/* 書籍ヘッダー */}
      <div className="flex gap-4">
        <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-lg">
          {book.coverImageUrl ? (
            <Image
              src={book.coverImageUrl}
              alt={`${book.title}の書影`}
              fill
              className="object-cover"
              sizes="128px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-800">
              No Image
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="break-words text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {book.title}
          </h1>
          <div className="flex flex-col items-start gap-1.5">
            <p className="text-zinc-600 dark:text-zinc-400">{book.author.name}</p>
            <FavoriteAuthorButton
              authorName={book.author.name}
              initialFavorited={favoriteRecord !== null}
              initialAuthorId={book.authorId}
            />
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            {publishedLabel}
          </p>
          {book.source === "manual" && book.createdByUserId === userId && (
            <EditBookButton
              book={{
                id: book.id,
                title: book.title,
                authorName: book.author.name,
                isbn: book.isbn,
                coverImageUrl: book.coverImageUrl,
                publishedAt: book.publishedAt.toISOString(),
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-2">
        <LibraryAvailabilityButton bookId={book.id} bookTitle={book.title} />
      </div>

      <div className="mt-4">
        <ReadingStatusButtons
          book={{
            id: book.id,
            title: book.title,
            authorName: book.author.name,
            isbn: book.isbn,
            coverImageUrl: book.coverImageUrl,
            publishedAt: book.publishedAt.toISOString(),
          }}
          initialStatus={currentStatus}
          hasReview={hasReview}
        />
      </div>

      {/* 受賞歴 */}
      {book.awardEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            受賞歴
          </h2>
          <ul className="flex flex-col gap-2">
            {book.awardEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    entry.type === "winner"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {entry.type === "winner" ? "受賞" : "ノミネート"}
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {entry.award.name}
                </span>
                <span className="ml-auto text-sm text-zinc-500">
                  {entry.year}年
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* レビュー一覧 */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          レビュー{book.reviews.length > 0 && `（${book.reviews.length}件）`}
        </h2>

        {book.reviews.length === 0 ? (
          <p className="text-sm text-zinc-500">まだレビューがありません。</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {book.reviews.map((review) => (
              <li
                key={review.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Link
                    href={`/users/${review.user.id}`}
                    className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    {review.user.name}
                  </Link>
                  {review.user.id !== userId && (
                    <FollowButton
                      targetUserId={review.user.id}
                      targetUserName={review.user.name}
                      initialFollowing={followingIds.has(review.user.id)}
                    />
                  )}
                  {review.isSpoiler && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
                      ネタバレあり
                    </span>
                  )}
                  <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                    {review.createdAt.toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {review.body}
                </p>
                <div className="mt-2 flex items-center justify-end gap-3">
                  {review.user.id !== userId && (
                    <ReportButton
                      reviewId={review.id}
                      initialReported={review.reports.length > 0}
                    />
                  )}
                  <LikeButton
                    reviewId={review.id}
                    initialLiked={review.likes.length > 0}
                    initialCount={review._count.likes}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </div>
  );
}
