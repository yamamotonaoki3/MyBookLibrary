"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reviewId: number;
};

export default function DeleteReviewButton({ reviewId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("この感想を削除しますか？")) return;

    setDeleting(true);
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
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {deleting ? "削除中..." : "削除"}
    </button>
  );
}
