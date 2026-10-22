import "server-only";
import { prisma } from "@/lib/prisma";
import { flatMapInChunks, uniqueBy } from "@/lib/chunk";

export function findPublicReviewCounts(bookIds: readonly number[]) {
  return flatMapInChunks([...new Set(bookIds)], ids => prisma.review.groupBy({
    by: ["bookId"], where: { bookId: { in: ids }, isPublic: true }, _count: { _all: true },
  }));
}

export async function findReviewBooks(candidates: readonly { title: string; author: string; isbn: string | null }[]) {
  const select = { id: true, title: true, isbn: true, author: { select: { name: true } } } as const;
  const isbns = [...new Set(candidates.flatMap(candidate => candidate.isbn ? [candidate.isbn] : []))];
  // Separate lookups keep each query within D1's bind budget, including edition ISBNs.
  const byIsbn = await flatMapInChunks(isbns, part => prisma.book.findMany({
    where: { OR: [{ isbn: { in: part } }, { bookIsbns: { some: { isbn: { in: part } } } }] }, select,
  }), 40);
  const isbnBooks = uniqueBy(byIsbn, book => book.id);
  const editions = await flatMapInChunks(isbnBooks.map(book => book.id), ids => prisma.bookIsbn.findMany({
    where: { bookId: { in: ids } }, select: { bookId: true, isbn: true },
  }), 50);
  const byBookId = new Map<number, { isbn: string }[]>();
  for (const edition of editions) {
    const values = byBookId.get(edition.bookId) ?? [];
    values.push({ isbn: edition.isbn }); byBookId.set(edition.bookId, values);
  }
  const resolvedIsbns = new Set<string>();
  for (const book of isbnBooks) {
    if (book.isbn) resolvedIsbns.add(book.isbn);
    for (const edition of byBookId.get(book.id) ?? []) resolvedIsbns.add(edition.isbn);
  }
  const keyOf = (title: string, author: string) => JSON.stringify([title, author]);
  const pairs = uniqueBy(candidates.filter(candidate => !candidate.isbn || !resolvedIsbns.has(candidate.isbn)),
    candidate => keyOf(candidate.title, candidate.author));
  const byPair = await flatMapInChunks(pairs, part => prisma.book.findMany({
    where: { OR: part.map(candidate => ({ title: candidate.title, author: { name: candidate.author } })) }, select,
  }), 40);
  const exactKeys = new Set(pairs.map(candidate => keyOf(candidate.title, candidate.author)));
  return uniqueBy([
    ...isbnBooks.map(book => ({ ...book, bookIsbns: byBookId.get(book.id) ?? [] })),
    ...byPair.filter(book => exactKeys.has(keyOf(book.title, book.author.name)))
      .map(book => ({ ...book, bookIsbns: [] })),
  ], book => book.id);
}
