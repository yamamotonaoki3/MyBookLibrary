"use client";

import { useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  name: string | null;
  email: string | null;
  isAdmin: boolean;
};

export function AccountInfoCard({ name, email, isAdmin }: Props) {
  const [open, setOpen] = useState(false);

  const roleLabel = isAdmin ? "管理者" : "一般ユーザー";

  return (
    <>
      {/* デスクトップ幅: 常時インライン表示（現状維持） */}
      <dl className="hidden flex-col gap-2 text-sm sm:flex">
        <div className="flex items-center gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">名前</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{name ?? "未設定"}</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">メール</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{email ?? "未設定"}</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">ロール</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{roleLabel}</dd>
        </div>
      </dl>

      {/* モバイル幅: ボタンでモーダルを開く */}
      <div className="sm:hidden">
        <Button size="sm" onClick={() => setOpen(true)}>
          アカウント情報を見る
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="mb-4 flex items-center justify-between">
            <DialogTitle>アカウント情報</DialogTitle>
            <DialogClose
              aria-label="閉じる"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕
            </DialogClose>
          </div>

          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-zinc-500">名前</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{name ?? "未設定"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-zinc-500">メール</dt>
              <dd className="break-all text-zinc-900 dark:text-zinc-50">{email ?? "未設定"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-zinc-500">ロール</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{roleLabel}</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
