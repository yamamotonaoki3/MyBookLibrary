"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type ReadingStatusValue = "unread" | "want_to_read" | "reading" | "read";

type Options = {
  initialStatus: ReadingStatusValue;
  initialBookId: number | null;
  /** POST /api/reading-status に送る本の情報（status は呼び出し側で付与される） */
  buildBody: () => Record<string, unknown>;
};

const SAVE_ERROR_MESSAGE = "保存に失敗しました。もう一度お試しください";

/**
 * 読書ステータスの変更を扱う共通フック。
 * - 表示は楽観的に即時更新する。
 * - 送信は 1 リクエストずつ直列に行い、送信中に押された値は最新の 1 つだけ保持する
 *   （応答の到着順入れ替わりによる、DB と画面のずれを防ぐ）。
 * - 失敗時は最後に保存できた値へ巻き戻し、エラーメッセージを返す。
 * - router.refresh() は送信キューが空になったときに 1 回だけ呼ぶ。
 */
export function useReadingStatus({ initialStatus, initialBookId, buildBody }: Options) {
  const router = useRouter();
  const [status, setStatus] = useState<ReadingStatusValue>(initialStatus);
  const [bookId, setBookId] = useState<number | null>(initialBookId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildBodyRef = useRef(buildBody);
  useEffect(() => {
    buildBodyRef.current = buildBody;
  });

  const confirmedRef = useRef<ReadingStatusValue>(initialStatus);
  const requestedRef = useRef<ReadingStatusValue>(initialStatus);
  const queuedRef = useRef<ReadingStatusValue | null>(null);
  const runningRef = useRef(false);

  const drain = useCallback(async () => {
    runningRef.current = true;
    setBusy(true);
    let anySucceeded = false;
    let lastFailed = false;

    while (queuedRef.current !== null) {
      const value = queuedRef.current;
      queuedRef.current = null;
      try {
        const res = await fetch("/api/reading-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildBodyRef.current(), status: value }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (data.bookId != null) setBookId(data.bookId);
        confirmedRef.current = value;
        anySucceeded = true;
        lastFailed = false;
      } catch {
        lastFailed = true;
      }
    }

    if (lastFailed) {
      requestedRef.current = confirmedRef.current;
      setStatus(confirmedRef.current);
      setError(SAVE_ERROR_MESSAGE);
    }
    runningRef.current = false;
    setBusy(false);
    if (anySucceeded) router.refresh();
  }, [router]);

  const changeStatus = useCallback(
    (newStatus: ReadingStatusValue) => {
      if (newStatus === requestedRef.current) return;
      requestedRef.current = newStatus;
      queuedRef.current = newStatus;
      setStatus(newStatus);
      setError(null);
      if (!runningRef.current) void drain();
    },
    [drain]
  );

  return { status, bookId, busy, error, changeStatus };
}
