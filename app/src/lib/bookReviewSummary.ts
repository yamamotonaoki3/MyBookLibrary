import "server-only";
import { findPublicReviewCounts, findReviewBooks } from "@/repositories/bookReviewRepository";

export async function getPublicReviewCounts(bookIds: readonly number[]): Promise<Map<number, number>> {
  const ids = [...new Set(bookIds)];
  const result = new Map(ids.map(id => [id, 0]));
  if (ids.length === 0) return result;
  for (const row of await findPublicReviewCounts(ids)) result.set(row.bookId, row._count._all);
  return result;
}

type ReviewBookCandidate = { id?: number; title: string; author: string; isbn: string | null };
const keyOf = (title: string, author: string) => JSON.stringify([title, author]);

/** Enrich external results without registering books or exposing private review counts. */
export async function withPublicReviewCounts<T extends ReviewBookCandidate>(items: readonly T[]): Promise<(T & { publicReviewCount: number })[]> {
  if (items.length === 0) return [];
  const external = items.filter(item => item.id == null);
  const books = external.length ? await findReviewBooks(external) : [];
  const byIsbn = new Map<string, number>();
  const byTitleAuthor = new Map<string, Set<number>>();
  for (const book of books) {
    for (const isbn of [book.isbn, ...book.bookIsbns.map(edition => edition.isbn)]) {
      if (isbn) byIsbn.set(isbn, book.id);
    }
    const key = keyOf(book.title, book.author.name);
    const ids = byTitleAuthor.get(key) ?? new Set<number>();
    ids.add(book.id); byTitleAuthor.set(key, ids);
  }
  const ids = items.map(item => {
    if (item.id != null) return item.id;
    const isbnId = item.isbn ? byIsbn.get(item.isbn) : undefined;
    if (isbnId != null) return isbnId;
    const matches = byTitleAuthor.get(keyOf(item.title, item.author));
    return matches?.size === 1 ? [...matches][0] : undefined;
  });
  const counts = await getPublicReviewCounts(ids.filter((id): id is number => id != null));
  return items.map((item, index) => ({ ...item, publicReviewCount: counts.get(ids[index]!) ?? 0 }));
}
