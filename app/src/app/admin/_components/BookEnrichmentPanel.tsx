"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 2000;

type EnrichmentJob = {
  id: number;
  status: "pending" | "running" | "completed";
  totalCount: number;
  doneCount: number;
  successCount: number;
  failCount: number;
};

type FailedItem = {
  bookId: number;
  title: string;
  errorMessage: string | null;
};

type Props = {
  adminFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

export function BookEnrichmentPanel({ adminFetch }: Props) {
  const [job, setJob] = useState<EnrichmentJob | null>(null);
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [failedListOpen, setFailedListOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchStatus(): Promise<void> {
    return adminFetch("/api/admin/book-enrichment/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setJob(data.job);
        setFailedItems(data.failedItems ?? []);
      });
  }

  // 初回ロードのみ：エフェクト内でのsetStateはPromiseコールバック経由にする
  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (job?.status === "pending" || job?.status === "running") {
      pollRef.current = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await adminFetch("/api/admin/book-enrichment/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error ?? "開始に失敗しました。");
        return;
      }
      await fetchStatus();
    } catch {
      setStartError("開始に失敗しました。");
    } finally {
      setStarting(false);
    }
  }

  const isRunning = job?.status === "running";

  return (
    <div className="mt-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          データ不足を補完
        </h3>
        <Button onClick={handleStart} disabled={starting || isRunning} size="sm" className="self-start">
          {isRunning ? "実行中..." : "一括補完を開始"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        楽天ブックスAPI・国立国会図書館サーチAPIから欠損データを検索して補完します。
      </p>

      {startError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{startError}</p>
      )}

      {job && (
        <div className="mt-3 text-sm">
          <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {job.doneCount} / {job.totalCount} 件処理済み
            </span>
            <span>
              成功 {job.successCount} ・ 失敗 {job.failCount}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width: `${job.totalCount > 0 ? Math.round((job.doneCount / job.totalCount) * 100) : 0}%`,
              }}
            />
          </div>

          {failedItems.length > 0 && (
            <div className="mt-3">
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
      )}
    </div>
  );
}
