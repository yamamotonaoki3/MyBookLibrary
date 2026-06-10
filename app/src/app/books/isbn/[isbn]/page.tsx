import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import type { Metadata } from "next";
import FavoriteAuthorButton from "@/app/books/_components/FavoriteAuthorButton";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ isbn: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { isbn } = await params;
  const book = await prisma.book.findUnique({ where: { isbn }, select: { title: true } });
  if (book) return { title: `${book.title} | MyBookLibrary` };
  const rakutenBook = await searchBooksByIsbn(isbn);
  return { title: rakutenBook ? `${rakutenBook.title} | MyBookLibrary` : "本の詳細" };
}

export default async function BookIsbnPage({ params }: Props) {
  const session = await auth();
  const userId = Number(session!.user.id);
  const { isbn } = await params;

  const dbBook = await prisma.book.findUnique({ where: { isbn } });
  if (dbBook) {
    redirect(`/books/${dbBook.id}`);
  }

  const rakutenBook = await searchBooksByIsbn(isbn);
  if (!rakutenBook) notFound();

  const normalizedAuthorName = normalizeAuthorName(rakutenBook.author);

  const favoriteRecord = await prisma.favoriteAuthor.findFirst({
    where: {
      userId: userId,
      author: { name: normalizedAuthorName },
    },
    select: { authorId: true },
  });

  const isFavorited = favoriteRecord !== null;
  const authorId = favoriteRecord?.authorId ?? null;

  return (
    <div className="flex flex-col px-4 py-6 lg:px-8 lg:py-8">
      {/* 書籍ヘッダー */}
      <div className="flex gap-6">
        <div className="relative h-48 w-32 shrink-0 overflow-hidden rounded-lg">
          {rakutenBook.largeImageUrl ? (
            <Image
              src={rakutenBook.largeImageUrl}
              alt={`${rakutenBook.title}の書影`}
              fill
              className="object-cover"
              sizes="128px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-400 dark:bg-zinc-800">
              No Image
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center gap-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {rakutenBook.title}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-zinc-600 dark:text-zinc-400">{rakutenBook.author}</p>
            <FavoriteAuthorButton
              authorName={rakutenBook.author}
              initialFavorited={isFavorited}
              initialAuthorId={authorId}
            />
          </div>
          {rakutenBook.publisherName && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              {rakutenBook.publisherName}
            </p>
          )}
          {rakutenBook.salesDate && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              {rakutenBook.salesDate}
            </p>
          )}
        </div>
      </div>

      <p className="mt-8 text-sm text-zinc-400 dark:text-zinc-500">
        この本はまだライブラリに登録されていません。
      </p>
    </div>
  );
}
