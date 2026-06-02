import Image from "next/image";
import type { BookWithAwardEntry } from "@/types/award";

type Props = {
  entry: BookWithAwardEntry;
};

export function BookCard({ entry }: Props) {
  const { book, type, year } = entry;

  return (
    <div className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded">
        {book.coverImageUrl ? (
          <Image
            src={book.coverImageUrl}
            alt={`${book.title}の書影`}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
            No Image
          </div>
        )}
      </div>

      <div className="flex flex-col justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              type === "winner"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            }`}
          >
            {type === "winner" ? "受賞" : "ノミネート"}
          </span>
          <span className="text-xs text-zinc-500">{year}年</span>
        </div>

        <div>
          <h3 className="font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {book.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {book.author.name}
          </p>
        </div>
      </div>
    </div>
  );
}
