"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { FavoriteAuthorItem } from "@/types/author";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Props = {
  author: FavoriteAuthorItem;
};

export function AuthorCard({ author }: Props) {
  const router = useRouter();
  const [notify, setNotify] = useState(author.notify);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  async function handleConfirmDelete() {
    setOpen(false);
    await fetch(`/api/favorite-authors/${author.authorId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  async function handleNotifyToggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !notify;
    setNotify(next);
    await fetch(`/api/favorite-authors/${author.authorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: next }),
    });
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/50"
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/favorite-authors/${author.authorId}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden min-w-0 truncate text-left font-semibold text-blue-600 hover:underline lg:block dark:text-blue-400"
          >
            {author.authorName}
          </Link>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="min-w-0 truncate text-left font-semibold text-blue-600 hover:underline lg:hidden dark:text-blue-400"
          >
            {author.authorName}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleNotifyToggle}
              title={notify ? "新刊通知ON（クリックでOFF）" : "新刊通知OFF（クリックでON）"}
              className="rounded-md px-2 py-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {notify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button
              onClick={handleDeleteClick}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              削除
            </button>
          </div>
        </div>

        <dl className="mt-3 hidden grid-cols-3 gap-2 text-center lg:grid">
          <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">登録作品</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {author.bookCount}冊
            </dd>
          </div>
          <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">読書中</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {author.readingCount}冊
            </dd>
          </div>
          <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">読了</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {author.readCount}冊
            </dd>
          </div>
        </dl>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <div className="mb-4 flex items-center justify-between">
            <DialogTitle>{author.authorName}</DialogTitle>
            <DialogClose className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              ✕
            </DialogClose>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">登録作品</dt>
              <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {author.bookCount}冊
              </dd>
            </div>
            <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">読書中</dt>
              <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {author.readingCount}冊
              </dd>
            </div>
            <div className="rounded-md bg-zinc-50 py-3 dark:bg-zinc-800">
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">読了</dt>
              <dd className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {author.readCount}冊
              </dd>
            </div>
          </dl>

          <Link
            href={`/favorite-authors/${author.authorId}`}
            className="mt-4 block w-full rounded-md bg-zinc-900 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            作品一覧
          </Link>
        </DialogContent>
      </Dialog>

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
