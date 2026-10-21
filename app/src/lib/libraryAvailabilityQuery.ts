import { checkAvailabilityByIsbn, type AvailabilityResult } from "@/lib/calil";
import { isbn13ToIsbn10 } from "@/lib/isbn";
import { findAvailabilityBook, findAvailabilityLibraries } from "@/repositories/libraryAvailabilityRepository";

export type AvailabilityTarget = { bookId: number } | { isbn: string };

export async function queryLibraryAvailability(userId: number, target: AvailabilityTarget) {
  const book = await findAvailabilityBook(target);
  if (!book && "bookId" in target) return null;
  const isbns = book
    ? book.bookIsbns.length > 0
      ? book.bookIsbns.map((b) => b.isbn)
      : book.isbn ? [book.isbn] : []
    : "isbn" in target ? [target.isbn] : [];
  if (isbns.length === 0) {
    return { results: {}, message: "この本にはISBNが登録されていません" };
  }

  const libraries = await findAvailabilityLibraries(userId);

  if (libraries.length === 0) {
    return { results: {}, message: "近隣図書館が登録されていません" };
  }

  const uniqueSystemids = [...new Set(libraries.map((l) => l.systemid))];
  const editionIsbns = new Map(
    isbns.map((isbn) => {
      const isbn10 = isbn13ToIsbn10(isbn);
      return [isbn, isbn10 ? [isbn, isbn10] : [isbn]] as const;
    })
  );
  const queryIsbns = [...new Set([...editionIsbns.values()].flat())];
  const grouped = await checkAvailabilityByIsbn(queryIsbns, uniqueSystemids);

  const filterAndEnrich = (rawResults: AvailabilityResult[]) => {
    const filtered = rawResults.filter((r) => {
      if (r.loanStatus === "蔵書なし") {
        return libraries.some((l) => l.systemid === r.systemid);
      }
      return libraries.some(
        (l) => l.systemid === r.systemid && (l.libkey === "" || l.libkey === r.libkey)
      );
    });

    const systemidsWithStock = new Set(
      filtered.filter((r) => r.loanStatus !== "蔵書なし").map((r) => r.systemid)
    );
    const deduped = filtered.filter(
      (r) => !(r.loanStatus === "蔵書なし" && systemidsWithStock.has(r.systemid))
    );

    return deduped.map((r) => {
      const lib = r.loanStatus === "蔵書なし"
        ? libraries.find((l) => l.systemid === r.systemid)
        : libraries.find((l) => l.systemid === r.systemid && (l.libkey === "" || l.libkey === r.libkey));
      return { ...r, libname: lib?.name ?? (r.libkey || r.systemid) };
    });
  };

  const results: Record<string, ReturnType<typeof filterAndEnrich>> = {};
  for (const [isbn, aliases] of editionIsbns) {
    const merged = new Map<string, AvailabilityResult>();
    for (const alias of aliases) {
      for (const result of grouped[alias] ?? []) {
        const key = JSON.stringify([result.systemid, result.libkey]);
        const existing = merged.get(key);
        if (!existing || (existing.loanStatus === "蔵書なし" && result.loanStatus !== "蔵書なし")) {
          merged.set(key, result);
        }
      }
    }
    results[isbn] = filterAndEnrich([...merged.values()]);
  }

  return { results };
}
