import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import DeleteReviewButton from "./_components/DeleteReviewButton";
import EditReviewForm from "./_components/EditReviewForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "投稿した感想 | MyBookLibrary",
};

const TEMP_USER_ID = 1;

export default async function MyReviewsPage() {
  const reviews = await prisma.review.findMany({
    where: { userId: TEMP_USER_ID },
    include: {
      book: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        投稿した感想
      </h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        {reviews.length} 件
      </p>

      {reviews.length === 0 ? (
        <p className="text-sm text-zinc-500">まだ感想を投稿していません。</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center gap-2">
                <Link
                  href={`/books/${review.book.id}`}
                  className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {review.book.title}
                </Link>
                <span className="ml-auto flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                  {review.createdAt.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  <DeleteReviewButton reviewId={review.id} />
                </span>
              </div>
              <EditReviewForm
                review={{
                  id: review.id,
                  body: review.body,
                  isSpoiler: review.isSpoiler,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
