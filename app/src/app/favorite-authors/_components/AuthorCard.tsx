"use client";

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
        <p className="font-semibold text-gray-900 dark:text-gray-100">
          {author.authorName}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          登録作品数: {author.bookCount}冊
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
