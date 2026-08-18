"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ReviewCandidate = {
  title: string;
  author: string;
  isbn: string;
  lamp: "green" | "red";
};

export type ReviewItem = {
  id: number;
  bookId: number;
  title: string;
  resultDetail: {
    candidates?: ReviewCandidate[];
    candidateNote?: string;
  } | null;
};

export type FailedItem = {
  bookId: number;
  title: string;
  errorMessage: string | null;
};

type JobSummary = {
  totalCount: number;
  successCount: number;
  failCount: number;
  reviewCount: number;
};

type Props = {
  job: JobSummary;
  reviewItems: ReviewItem[];
  failedItems: FailedItem[];
  onClose: () => void;
  onConfirm: (itemId: number, isbn: string) => Promise<void>;
  onDismiss: (itemId: number) => Promise<void>;
};

export function BookEnrichmentResultModal({
  job,
  reviewItems,
  failedItems,
  onClose,
  onConfirm,
  onDismiss,
}: Props) {
  const [failedListOpen, setFailedListOpen] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  async function handleConfirmClick(itemId: number, isbn: string) {
    setBusyItemId(itemId);
    try {
      await onConfirm(itemId, isbn);
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDismissClick(itemId: number) {
    setBusyItemId(itemId);
    try {
      await onDismiss(itemId);
    } finally {
      setBusyItemId(null);
    }
  }

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
            成功 {job.successCount} ・ 失敗 {job.failCount} ・ 要確認 {job.reviewCount}
          </span>
        </div>

        {reviewItems.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
              要確認（{reviewItems.length}件）
            </h3>
            <ul className="flex flex-col gap-3">
              {reviewItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700"
                >
                  <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                  {item.resultDetail?.candidates && item.resultDetail.candidates.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {item.resultDetail.candidates.map((candidate) => (
                        <li
                          key={candidate.isbn}
                          className="flex items-center justify-between gap-2 rounded bg-zinc-50 p-2 dark:bg-zinc-800"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="mr-1" aria-label={candidate.lamp === "green" ? "実在確認済み" : "実在未確認"}>
                              {candidate.lamp === "green" ? "🟢" : "🔴"}
                            </span>
                            <span className="text-xs text-zinc-700 dark:text-zinc-300">
                              {candidate.title}（{candidate.author}）ISBN: {candidate.isbn}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyItemId === item.id}
                            onClick={() => handleConfirmClick(item.id, candidate.isbn)}
                          >
                            この候補を採用
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    item.resultDetail?.candidateNote && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.resultDetail.candidateNote}
                      </p>
                    )
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyItemId === item.id}
                      onClick={() => handleDismissClick(item.id)}
                    >
                      見送る
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

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
