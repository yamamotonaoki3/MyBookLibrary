import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { deduplicateByTitle, searchBooks } from "@/lib/rakuten";
import { BookStatusCard } from "./_components/BookStatusCard";
import { SearchInput } from "./_components/SearchInput";
import type { AuthorBook } from "@/types/author";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ authorId: string }>;
  searchParams: Promise<{ q?: string }>;
};

async function BookList({
  authorId,
  authorName,
  query,
  userId,
}: {
  authorId: number;
  authorName: string;
  query?: string;
  userId: number;
}) {
  const author = await prisma.author.findUnique({
    where: { id: authorId },
    select: { name: true },
  });

  if (!author) notFound();

  const allBooks = deduplicateByTitle(
    await searchBooks({ author: author.name, maxPages: 5 })
  );

  const filteredBooks = query
    ? allBooks.filter((b) =>
        b.title.toLowerCase().includes(query.toLowerCase())
      )
    : allBooks;

  const isbnList = filteredBooks.map((b) => b.isbn).filter(Boolean);
  const dbBooks = await prisma.book.findMany({
    where: {
      OR: [
        { isbn: { in: isbnList } },
        { authorId, title: { in: filteredBooks.map((b) => b.title) } },
      ],
    },
    select: {
      id: true,
      isbn: true,
      title: true,
      readingStatuses: {
        where: { userId },
        select: { status: true },
      },
      reviews: {
        where: { userId },
        select: { id: true },
      },
      awardEntries: {
        select: { year: true, type: true, award: { select: { name: true } } },
      },
    },
  });

  const bookByIsbn = new Map(dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b]));
  const bookByTitle = new Map(dbBooks.map((b) => [b.title, b]));

  const books: AuthorBook[] = filteredBooks.map((book) => {
    const dbBook =
      (book.isbn ? bookByIsbn.get(book.isbn) : undefined) ??
      bookByTitle.get(book.title);
    return {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      coverImageUrl: book.largeImageUrl || null,
      publisherName: book.publisherName,
      salesDate: book.salesDate,
      bookId: dbBook?.id ?? null,
      status: (dbBook?.readingStatuses[0]?.status ?? "unread") as AuthorBook["status"],
      hasReview: (dbBook?.reviews.length ?? 0) > 0,
      awards: dbBook?.awardEntries.map((e) => ({ name: e.award.name, year: e.year, type: e.type })) ?? [],
    };
  });

  if (books.length === 0) {
    return (
      <p className="py-16 text-center text-gray-500 dark:text-gray-400">
        この著者の本が見つかりませんでした
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {query
          ? `「${query}」の絞り込み結果: ${filteredBooks.length}件`
          : `全${allBooks.length}冊`}
      </p>

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {books.map((book) => (
          <li key={book.isbn || book.title} className="h-full">
            <BookStatusCard book={book} canonicalAuthorName={authorName} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AuthorBooksPage({ params, searchParams }: Props) {
  const session = await auth();
  const userId = Number(session!.user.id);
  const { authorId: authorIdParam } = await params;
  const { q } = await searchParams;
  const authorId = Number(authorIdParam);
  const query = q?.trim() || undefined;

  if (!authorId || isNaN(authorId)) notFound();

  const author = await prisma.author.findUnique({
    where: { id: authorId },
    select: { name: true },
  });

  if (!author) notFound();

  return (
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mb-5 shrink-0 lg:mb-6">
        <Link
          href="/favorite-authors"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← お気に入り著者一覧に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">
          {author.name} の作品一覧
        </h1>
      </div>

      <div className="mb-4 shrink-0">
        <SearchInput />
      </div>

      <div className="flex-1 overflow-y-auto">
        <Suspense
          fallback={<p className="text-center text-gray-500">読み込み中...</p>}
          key={query ?? ""}
        >
          <BookList authorId={authorId} authorName={author.name} query={query} userId={userId} />
        </Suspense>
      </div>
    </main>
  );
}
