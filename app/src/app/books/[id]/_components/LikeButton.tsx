"use client";

import { useState } from "react";

type Props = {
  reviewId: number;
  initialLiked: boolean;
  initialCount: number;
};

export default function LikeButton({
  reviewId,
  initialLiked,
  initialCount,
}: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const nextLiked = !liked;
    const nextCount = nextLiked ? count + 1 : count - 1;

    setLiked(nextLiked);
    setCount(nextCount);
    setPending(true);

    try {
      const res = await fetch(`/api/reviews/${reviewId}/likes`, {
        method: nextLiked ? "POST" : "DELETE",
      });

      if (!res.ok) {
        setLiked(liked);
        setCount(count);
      }
    } catch {
      setLiked(liked);
      setCount(count);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-50 ${
        liked
          ? "text-red-500 dark:text-red-400"
          : "text-zinc-400 hover:text-red-400 dark:text-zinc-500 dark:hover:text-red-400"
      }`}
    >
      <span>{liked ? "♥" : "♡"}</span>
      <span>{count}</span>
    </button>
  );
}
