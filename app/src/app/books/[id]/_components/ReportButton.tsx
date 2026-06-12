"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  reviewId: number;
  initialReported: boolean;
};

export function ReportButton({ reviewId, initialReported }: Props) {
  const [reported, setReported] = useState(initialReported);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    const res = await fetch(`/api/reviews/${reviewId}/report`, { method: "POST" });
    setLoading(false);
    if (res.ok) {
      setReported(true);
    }
  }

  if (reported) {
    return (
      <span className="text-xs text-zinc-400 dark:text-zinc-600">通報済み</span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50 dark:text-zinc-600 dark:hover:text-red-400"
      >
        通報
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="このレビューを通報しますか？"
        description="著者・作品への誹謗中傷が確認された場合、管理者が削除対応を行います。"
        confirmLabel="通報する"
        confirmVariant="default"
        onConfirm={handleConfirm}
      />
    </>
  );
}
