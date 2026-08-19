import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailabilityByIsbn, type AvailabilityResult } from "@/lib/calil";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const bookId = Number(searchParams.get("bookId"));
  if (!bookId || Number.isNaN(bookId)) {
    return NextResponse.json({ error: "bookId は必須です" }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { bookIsbns: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
  });
  if (!book) {
    return NextResponse.json({ error: "本が見つかりません" }, { status: 404 });
  }

  // BookIsbnが未登録の本（旧データ・単一ISBNのみの本）は代表ISBNのみを対象にする
  const isbns = book.bookIsbns.length > 0
    ? book.bookIsbns.map((b) => b.isbn)
    : book.isbn
      ? [book.isbn]
      : [];

  if (isbns.length === 0) {
    return NextResponse.json({ results: {}, message: "この本にはISBNが登録されていません" });
  }

  const libraries = await prisma.userLibrary.findMany({
    where: { userId },
    select: { systemid: true, libkey: true, name: true },
  });

  if (libraries.length === 0) {
    return NextResponse.json({ results: {}, message: "近隣図書館が登録されていません" });
  }

  try {
    const uniqueSystemids = [...new Set(libraries.map((l) => l.systemid))];
    const grouped = await checkAvailabilityByIsbn(isbns, uniqueSystemids);

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
    for (const isbn of isbns) {
      results[isbn] = filterAndEnrich(grouped[isbn] ?? []);
    }

    return NextResponse.json({ results });
  } catch (err) {
    logger.error({ err }, "[GET /api/calil/check-book]");
    return NextResponse.json(
      { error: "貸出状況の確認に失敗しました" },
      { status: 500 }
    );
  }
}
