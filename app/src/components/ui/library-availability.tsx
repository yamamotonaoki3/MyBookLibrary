"use client";

import { useState } from "react";
import { Library, ExternalLink } from "lucide-react";

type AvailabilityResult = {
  systemid: string;
  libkey: string;
  libname: string;
  loanStatus: string;
  reserveurl: string;
};

type Props = {
  isbn: string;
};

// 貸出状況に応じたバッジスタイル
function getLoanStatusStyle(status: string): string {
  switch (status) {
    case "貸出可":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "蔵書あり":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "館内のみ":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "貸出中":
    case "予約中":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "準備中":
    case "休館中":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "蔵書なし":
      return "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500";
    default:
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

// 予約リンクを表示するかどうか（蔵書がある状態のみ）
function showReserveLink(status: string): boolean {
  return ["貸出可", "蔵書あり", "館内のみ", "貸出中", "予約中", "準備中"].includes(status);
}

export function LibraryAvailability({ isbn }: Props) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AvailabilityResult[] | null>(null);
  const [noLibraries, setNoLibraries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    setNoLibraries(false);
    try {
      const res = await fetch(`/api/calil/check?isbn=${encodeURIComponent(isbn)}`);
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
