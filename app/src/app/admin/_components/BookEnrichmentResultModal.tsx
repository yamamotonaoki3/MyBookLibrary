"use client";

import { useState } from "react";

export type FailedItem = {
  bookId: number;
  title: string;
  errorMessage: string | null;
};

type JobSummary = {
  totalCount: number;
  successCount: number;
  failCount: number;
};

type Props = {
  job: JobSummary;
  failedItems: FailedItem[];
  onClose: () => void;
};

export function BookEnrichmentResultModal({ job, failedItems, onClose }: Props) {
  const [failedListOpen, setFailedListOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            一括補完が完了しました
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>合計 {job.totalCount} 件</span>
          <span>
            成功 {job.successCount} ・ 失敗 {job.failCount}
          </span>
        </div>

        {failedItems.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setFailedListOpen((v) => !v)}
              className="text-xs text-red-600 underline dark:text-red-400"
            >
              失敗した本を{failedListOpen ? "閉じる" : "表示"}（{failedItems.length}件）
            </button>
            {failedListOpen && (
              <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-4 text-xs text-red-600 dark:text-red-400">
                {failedItems.map((item) => (
                  <li key={item.bookId}>
                    {item.title}: {item.errorMessage ?? "不明なエラー"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
