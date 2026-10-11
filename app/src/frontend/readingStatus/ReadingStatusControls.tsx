"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { ReadingStatusValue } from "./useReadingStatus";

const STATUS_ORDER = ["unread", "want_to_read", "reading", "read"] as const;

const STATUS_LABELS: Record<ReadingStatusValue, string> = {
  unread: "未読",
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

const STATUS_ACTIVE_COLORS: Record<ReadingStatusValue, string> = {
  unread: "bg-zinc-600 text-white",
  want_to_read: "bg-orange-500 text-white",
  reading: "bg-blue-600 text-white",
  read: "bg-green-600 text-white",
};

const INACTIVE_COLORS =
  "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600";

type Props = {
  status: ReadingStatusValue;
  busy: boolean;
  /** busy 中に下段へ表示する文言（例: 「保存中…」） */
  busyMessage: string;
  error: string | null;
  onChange: (status: ReadingStatusValue) => void;
  /** ボタンの余白・文字サイズ（例: "px-3 py-1 text-xs"） */
  buttonClassName: string;
  /** 「感想を書く」「感想投稿済み」などのチップ。下段の固定領域に表示される */
  children?: ReactNode;
};

/**
 * 読書ステータスのボタン行。ステータス変更前後でカードの高さが変わらないよう、
 * ボタン行（折り返しなし）とは別に、チップ・保存中表示・エラー表示用の固定高の行を常に確保する。
 */
export function ReadingStatusControls({
  status,
  busy,
  busyMessage,
  error,
  onChange,
  buttonClassName,
  children,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div role="group" aria-label="読書ステータス" className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => {
          const active = status === s;
          const saving = busy && active;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={active}
              aria-busy={saving}
              className={`relative rounded-full font-medium transition-colors ${buttonClassName} ${
                active ? STATUS_ACTIVE_COLORS[s] : INACTIVE_COLORS
              }`}
            >
              {/* ラベルは残したままスピナーを重ね、ボタン幅が変わらないようにする */}
              <span className={saving ? "opacity-0" : undefined}>{STATUS_LABELS[s]}</span>
              {saving && (
                <Loader2
                  className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      {/* チップ用の固定高の行。中身が無くても高さを確保する */}
      <div className="flex h-7 items-center overflow-hidden whitespace-nowrap">{children}</div>
      {/* 保存中・エラー表示用の固定高の行。本文列が狭くてもチップに押し出されないよう別行にする */}
      <div className="h-4 overflow-hidden text-xs leading-4" aria-live="polite">
        {error ? (
          <span role="alert" className="block truncate text-red-600 dark:text-red-400">
            {error}
          </span>
        ) : busy ? (
          <span className="block truncate text-zinc-500 dark:text-zinc-400">{busyMessage}</span>
        ) : null}
      </div>
    </div>
  );
}
