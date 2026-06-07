"use client";

import { useState } from "react";

type Props = {
  reviewId: number;
  initialReported: boolean;
};

export function ReportButton({ reviewId, initialReported }: Props) {
  const [reported, setReported] = useState(initialReported);
  const [loading, setLoading] = useState(false);

  async function handleReport() {
    if (reported) return;
    const confirmed = window.confirm(
      "このレビューを通報しますか？\n著者・作品への誹謗中傷が確認された場合、管理者が削除対応を行います。"
    );
    if (!confirmed) return;

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
    <button
      onClick={handleReport}
      disabled={loading}
      className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50 dark:text-zinc-600 dark:hover:text-red-400"
    >
      通報
    </button>
  );
}
