"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  reviewId: number;
};

export default function DeleteReviewButton({ reviewId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "削除に失敗しました。");
        return;
      }

      router.refresh();
    } catch {
      alert("削除に失敗しました。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={deleting}
        className="text-xs text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
      >
        {deleting ? "削除中..." : "削除"}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="感想を削除しますか？"
        description="削除した感想は元に戻せません。"
        confirmLabel="削除する"
        onConfirm={handleConfirm}
      />
    </>
  );
}
