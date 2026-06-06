import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deduplicateByTitle, searchBooks } from "@/lib/rakuten";
import { BookStatusCard } from "./_components/BookStatusCard";
import type { AuthorBook } from "@/types/author";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type Props = {
  params: Promise<{ authorId: string }>;
  searchParams: Promise<{ page?: string }>;
};

async function BookList({
  authorId,
  authorName,
  page,
}: {
  authorId: number;
  authorName: string;
  page: number;
}) {
  const author = await prisma.author.findUnique({
    where: { id: authorId },
    select: { name: true },
  });

  if (!author) notFound();

  const allBooks = deduplicateByTitle(
    await searchBooks({ author: author.name })
  );

  const totalPages = Math.max(1, Math.ceil(allBooks.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRakutenBooks = allBooks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const isbnList = pagedRakutenBooks.map((b) => b.isbn).filter(Boolean);
  const dbBooks = await prisma.book.findMany({
    where: {
      OR: [
        { isbn: { in: isbnList } },
        { authorId, title: { in: pagedRakutenBooks.map((b) => b.title) } },
      ],
    },
    select: {
      id: true,
      isbn: true,
      title: true,
      readingStatuses: {
        where: { userId: 1 },
        select: { status: true },
      },
    },
  });

  const bookByIsbn = new Map(dbBooks.filter((b) => b.isbn).map((b) => [b.isbn, b]));
  const bookByTitle = new Map(dbBooks.map((b) => [b.title, b]));

  const books: AuthorBook[] = pagedRakutenBooks.map((book) => {
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
        全{allBooks.length}冊 / {currentPage}/{totalPages}ページ
      </p>

      <ul className="flex flex-col gap-3">
        {books.map((book) => (
          <li key={book.isbn || book.title}>
            <BookStatusCard book={book} canonicalAuthorName={authorName} />
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Link
            href={`?page=${currentPage - 1}`}
            aria-disabled={currentPage === 1}
            className={`rounded-md px-3 py-1.5 text-sm ${
              currentPage === 1
                ? "pointer-events-none text-gray-300 dark:text-gray-600"
                : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            }`}
          >
            ← 前へ
          </Link>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`?page=${p}`}
              className={`rounded-md px-3 py-1.5 text-sm ${
                p === currentPage
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {p}
            </Link>
          ))}

          <Link
            href={`?page=${currentPage + 1}`}
            aria-disabled={currentPage === totalPages}
            className={`rounded-md px-3 py-1.5 text-sm ${
              currentPage === totalPages
                ? "pointer-events-none text-gray-300 dark:text-gray-600"
                : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            }`}
          >
            次へ →
          </Link>
        </div>
      )}
    </div>
  );
}

export default async function AuthorBooksPage({ params, searchParams }: Props) {
  const { authorId: authorIdParam } = await params;
  const { page: pageParam } = await searchParams;
  const authorId = Number(authorIdParam);
  const page = Number(pageParam ?? "1");

  if (!authorId || isNaN(authorId)) notFound();

  const author = await prisma.author.findUnique({
    where: { id: authorId },
    select: { name: true },
  });

  if (!author) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/favorite-authors"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← お気に入り著者一覧に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {author.name} の作品一覧
        </h1>
      </div>

      <Suspense
        fallback={<p className="text-center text-gray-500">読み込み中...</p>}
        key={page}
      >
        <BookList authorId={authorId} authorName={author.name} page={page} />
      </Suspense>
    </main>
  );
}
