"use client";

import { useRouter, useSearchParams } from "next/navigation";

type FavoriteAuthor = { id: number; name: string };

type Props = {
  favoriteAuthors: FavoriteAuthor[];
};

export function BooksFilter({ favoriteAuthors }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const author = searchParams.get("author") ?? "all";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`/books?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <select
        value={status}
        onChange={(e) => update("status", e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        <option value="all">すべてのステータス</option>
        <option value="want_to_read">読みたい</option>
        <option value="reading">読書中</option>
        <option value="read">読了</option>
      </select>

      <select
        value={author}
        onChange={(e) => update("author", e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        <option value="all">すべての著者</option>
        {favoriteAuthors.map((fa) => (
          <option key={fa.id} value={String(fa.id)}>
            {fa.name}
          </option>
        ))}
        <option value="others">その他</option>
      </select>
    </div>
  );
}
