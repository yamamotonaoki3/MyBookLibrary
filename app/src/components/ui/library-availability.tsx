"use client";

import { useState } from "react";
import { Library, ExternalLink } from "lucide-react";
import { getLoanStatusStyle, showReserveLink } from "@/lib/libraryAvailabilityUi";

type AvailabilityResult = {
  systemid: string;
  libkey: string;
  libname: string;
  loanStatus: string;
  reserveurl: string;
};

type Props = {
  isbn: string;
  title?: string;
};

export function LibraryAvailability({ isbn, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AvailabilityResult[] | null>(null);
  const [noLibraries, setNoLibraries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    setNoLibraries(false);
    try {
      const url = `/api/calil/check?isbn=${encodeURIComponent(isbn)}`
        + (title ? `&title=${encodeURIComponent(title)}` : "");
      const res = await fetch(url);
      if (!res.ok) {
        setError("確認に失敗しました");
        return;
      }
      const data = await res.json();
      if (data.message) {
        setNoLibraries(true);
        return;
      }
      setResults(data.results ?? []);
    } catch {
      setError("確認に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (noLibraries) {
    return (
      <p className="text-xs text-zinc-400">
        設定画面で近隣図書館を登録してください
      </p>
    );
  }

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>;
  }

  if (results !== null) {
    if (results.length === 0) {
      return <p className="text-xs text-zinc-400">登録図書館に蔵書情報がありません</p>;
    }
    return (
      <div className="flex flex-col gap-1">
        {results.map((r, i) => (
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
        <a
          href="https://calil.jp/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-400 hover:underline dark:text-zinc-500"
        >
          蔵書情報提供：カーリル
        </a>
      </div>
    );
  }

  return (
    <button
      onClick={handleCheck}
      disabled={loading}
      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
    >
      <Library className="h-3.5 w-3.5" />
      {loading ? "確認中..." : "図書館の在庫を確認"}
    </button>
  );
}
