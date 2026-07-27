"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecommendedAuthor } from "@/lib/recommendations";

type Props = {
  recommendations: RecommendedAuthor[];
};

export function RecommendedAuthors({ recommendations }: Props) {
  const router = useRouter();
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  if (recommendations.length === 0) return null;

  async function handleAdd(name: string) {
    setAddError(null);
    setPendingName(name);
    try {
      const res = await fetch("/api/favorite-authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: name }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error ?? "追加に失敗しました。");
        return;
      }
      setAddedNames((prev) => new Set(prev).add(name));
      router.refresh();
    } catch {
      setAddError("追加に失敗しました。");
    } finally {
      setPendingName(null);
    }
  }

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        こんな著者もおすすめ
      </h2>
      {addError && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">{addError}</p>
      )}
      <ul className="flex flex-col gap-2">
        {recommendations.map((rec) => {
          const added = addedNames.has(rec.name);
          return (
            <li
              key={rec.authorId}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {rec.name}
              </span>
              {added ? (
                <span className="text-xs text-zinc-400">追加済み</span>
              ) : (
                <button
                  onClick={() => handleAdd(rec.name)}
                  disabled={pendingName === rec.name}
                  className="shrink-0 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {pendingName === rec.name ? "追加中..." : "追加する"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
