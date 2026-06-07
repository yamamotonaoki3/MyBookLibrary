"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FavoriteAuthorItem } from "@/types/author";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  author: FavoriteAuthorItem;
};

export function AuthorCard({ author }: Props) {
  const router = useRouter();
  const [notify, setNotify] = useState(author.notify);
  const [open, setOpen] = useState(false);

  async function handleConfirmDelete() {
    setOpen(false);
    await fetch(`/api/favorite-authors/${author.authorId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  async function handleNotifyToggle() {
    const next = !notify;
    setNotify(next);
    await fetch(`/api/favorite-authors/${author.authorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: next }),
    });
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <Link
            href={`/favorite-authors/${author.authorId}`}
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {author.authorName}
          </Link>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            登録作品: {author.bookCount}冊 &nbsp;／&nbsp; 読書中: {author.readingCount}冊 &nbsp;／&nbsp; 読了: {author.readCount}冊
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNotifyToggle}
            title={notify ? "新刊通知ON（クリックでOFF）" : "新刊通知OFF（クリックでON）"}
            className="rounded-md px-2 py-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {notify ? "🔔" : "🔕"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            削除
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="お気に入り著者を削除しますか？"
        description={`${author.authorName} をお気に入りから削除します。`}
        confirmLabel="削除する"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
