"use client";

import { useState } from "react";

type Props = {
  authorName: string;
  initialFavorited: boolean;
  initialAuthorId: number | null;
};

export default function FavoriteAuthorButton({
  authorName,
  initialFavorited,
  initialAuthorId,
}: Props) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [authorId, setAuthorId] = useState<number | null>(initialAuthorId);
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    if (pending) return;
    setPending(true);

    try {
      if (!favorited) {
        const res = await fetch("/api/favorite-authors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorName }),
        });
        if (res.ok) {
          const data = await res.json();
          setAuthorId(data.authorId);
          setFavorited(true);
        }
      } else if (authorId !== null) {
        const res = await fetch(`/api/favorite-authors/${authorId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setFavorited(false);
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        favorited
          ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
          : "border-zinc-300 bg-white text-zinc-600 hover:border-amber-400 hover:text-amber-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-amber-500 dark:hover:text-amber-400"
      }`}
    >
      <span>{favorited ? "★" : "☆"}</span>
      <span>{favorited ? "お気に入り済み" : "お気に入り登録"}</span>
    </button>
  );
}
