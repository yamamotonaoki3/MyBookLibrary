"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { getLoanStatusStyle, showReserveLink } from "@/lib/libraryAvailabilityUi";

type AvailabilityResult = {
  systemid: string;
  libkey: string;
  libname: string;
  loanStatus: string;
  reserveurl: string;
};

type Props = {
  bookId: number;
  bookTitle: string;
  onClose: () => void;
};

export function LibraryAvailabilityModal({ bookId, bookTitle, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, AvailabilityResult[]> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/calil/check-book?bookId=${bookId}`);
        if (cancelled) return;
        if (!res.ok) {
          setError("確認に失敗しました");
          return;
        }
        const data = await res.json();
        if (data.message) {
          setMessage(data.message);
          return;
        }
        setResults(data.results ?? {});
      } catch {
        if (!cancelled) setError("確認に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const isbns = results ? Object.keys(results) : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              版ごとの在庫状況
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{bookTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-zinc-500">確認中...</p>}
        {!loading && error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && message && (
          <p className="text-sm text-zinc-400">{message}</p>
        )}

        {!loading && !error && !message && isbns.length === 0 && (
          <p className="text-sm text-zinc-400">この本にはISBNが登録されていません</p>
        )}

        {!loading && !error && !message && isbns.length > 0 && (
          <ul className="flex flex-col gap-4">
            {isbns.map((isbn) => {
              const isbnResults = results![isbn];
              return (
                <li key={isbn} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="mb-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    ISBN: {isbn}
                  </p>
                  {isbnResults.length === 0 ? (
                    <p className="text-xs text-zinc-400">登録図書館に蔵書情報がありません</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {isbnResults.map((r, i) => (
                        <div key={`${r.systemid}__${r.libkey}__${i}`} className="flex items-center gap-1.5 flex-wrap">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getLoanStatusStyle(r.loanStatus)}`}>
                            {r.loanStatus}
                          </span>
                          <span className="text-xs text-zinc-500">{r.libname}</span>
                          {showReserveLink(r.loanStatus) && r.reserveurl && (
                            <a
                              href={r.reserveurl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                              予約する <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && !message && isbns.length > 0 && (
          <a
            href="https://calil.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block text-[10px] text-zinc-400 hover:underline dark:text-zinc-500"
          >
            蔵書情報提供：カーリル
          </a>
        )}
      </div>
    </div>
  );
}
