"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FavoriteAuthorItem } from "@/types/author";

type Props = {
  author: FavoriteAuthorItem;
};

export function AuthorCard({ author }: Props) {
  const router = useRouter();

  async function handleDelete() {
    await fetch(`/api/favorite-authors/${author.authorId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div>
        <Link
          href={`/favorite-authors/${author.authorId}`}
          className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          {author.authorName}
        </Link>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          読書中: {author.readingCount}冊
        </p>
      </div>
      <button
        onClick={handleDelete}
        className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        削除
      </button>
    </div>
  );
}
