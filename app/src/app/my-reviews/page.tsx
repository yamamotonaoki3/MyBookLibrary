import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import type { Metadata } from "next";
import DeleteReviewButton from "./_components/DeleteReviewButton";
import EditReviewForm from "./_components/EditReviewForm";
import { WriteReviewModal } from "./_components/WriteReviewModal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "投稿した感想 | MyBookLibrary",
};

export default async function MyReviewsPage() {
  const session = await auth();
  const userId = Number(session!.user.id);

  const reviews = await prisma.review.findMany({
    where: { userId },
    include: {
      book: { select: { id: true, title: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-wrap shrink-0 items-center justify-between gap-2 lg:mb-6">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight lg:text-3xl">
            投稿した感想
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {reviews.length} 件
          </p>
        </div>
        <WriteReviewModal />
      </div>

      <div className="flex-1 overflow-y-auto">
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
                  <span className="flex items-center gap-0.5 text-red-400 dark:text-red-400">
                    <span>♥</span>
                    <span>{review._count.likes}</span>
                  </span>
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
                  isPublic: review.isPublic,
                }}
              />
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
