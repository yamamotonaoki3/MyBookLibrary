"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookEnrichmentResultModal, type FailedItem } from "./BookEnrichmentResultModal";

const POLL_INTERVAL_MS = 2000;

type EnrichmentJob = {
  id: number;
  status: "pending" | "running" | "completed" | "cancelled";
  totalCount: number;
  doneCount: number;
  successCount: number;
  failCount: number;
  cancelRequested: boolean;
};

type Props = {
  adminFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

export function BookEnrichmentPanel({ adminFetch }: Props) {
  const [job, setJob] = useState<EnrichmentJob | null>(null);
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string | null>(null);

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

  // 実行中→完了への遷移を検知したときだけ結果モーダルを自動表示する
  useEffect(() => {
    if (
      (job?.status === "completed" || job?.status === "cancelled") &&
      prevStatusRef.current === "running"
    ) {
      setResultModalOpen(true);
    }
    prevStatusRef.current = job?.status ?? null;
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

  async function handleCancel() {
    if (!window.confirm("実行中の一括補完処理を中断しますか？未処理の項目は中断扱いになります。")) {
      return;
    }
    setCancelling(true);
    try {
      await adminFetch("/api/admin/book-enrichment/cancel", { method: "POST" });
      await fetchStatus();
    } finally {
      setCancelling(false);
    }
  }

  const isRunning = job?.status === "running";

  return (
    <div className="mt-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          データ不足を補完
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleStart} disabled={starting || isRunning} size="sm" className="self-start">
            {isRunning ? "実行中..." : "一括補完を開始"}
          </Button>
          {isRunning && (
            <Button
              onClick={handleCancel}
              disabled={cancelling || job?.cancelRequested}
              size="sm"
              variant="outline"
              className="self-start"
            >
              {job?.cancelRequested ? "中断処理中..." : "中断"}
            </Button>
          )}
          {(job?.status === "completed" || job?.status === "cancelled") && (
            <Button
              onClick={() => setResultModalOpen(true)}
              disabled={isRunning}
              size="sm"
              variant="outline"
              className="self-start"
            >
              前回の結果を確認
            </Button>
          )}
        </div>
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
        </div>
      )}

      {resultModalOpen && job && (
        <BookEnrichmentResultModal
          job={job}
          failedItems={failedItems}
          onClose={() => setResultModalOpen(false)}
        />
      )}
    </div>
  );
}
