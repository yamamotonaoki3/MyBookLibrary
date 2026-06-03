import Image from "next/image";
import Link from "next/link";

type Props = {
  book: {
    id: number;
    title: string;
    coverImageUrl: string | null;
    author: { name: string };
  };
};

export function BookCard({ book }: Props) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="flex gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
    >
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

      <div className="flex flex-col justify-center gap-1">
        <h3 className="font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
          {book.title}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {book.author.name}
        </p>
      </div>
    </Link>
  );
}
