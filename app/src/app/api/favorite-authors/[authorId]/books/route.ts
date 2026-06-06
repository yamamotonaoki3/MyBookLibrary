import { prisma } from "@/lib/prisma";
import { searchBooks } from "@/lib/rakuten";

const TEMP_USER_ID = 1;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ authorId: string }> }
) {
  try {
    const { authorId: authorIdParam } = await params;
    const authorId = Number(authorIdParam);

    if (!authorId || isNaN(authorId)) {
      return Response.json({ error: "Invalid authorId" }, { status: 400 });
    }

    const author = await prisma.author.findUnique({
      where: { id: authorId },
      select: { name: true },
    });

    if (!author) {
      return Response.json({ error: "Author not found" }, { status: 404 });
    }

    // 楽天APIで著者の本を検索
    const rakutenBooks = await searchBooks({ author: author.name });

    // DBのReadingStatus・受賞情報をISBNまたはタイトルで照合
    const isbnList = rakutenBooks.map((b) => b.isbn).filter(Boolean);
    const titleList = rakutenBooks.map((b) => b.title);
    const books = await prisma.book.findMany({
      where: {
        OR: [
          { isbn: { in: isbnList } },
          { authorId, title: { in: titleList } },
        ],
      },
      select: {
        id: true,
        isbn: true,
        title: true,
        readingStatuses: {
          where: { userId: TEMP_USER_ID },
          select: { status: true },
        },
        awardEntries: {
          select: { year: true, type: true, award: { select: { name: true } } },
        },
      },
    });

    const bookByIsbn = new Map(books.filter((b) => b.isbn).map((b) => [b.isbn, b]));
    const bookByTitle = new Map(books.map((b) => [b.title, b]));

    const result = rakutenBooks.map((book) => {
      const dbBook = (book.isbn ? bookByIsbn.get(book.isbn) : undefined) ?? bookByTitle.get(book.title);
      return {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        coverImageUrl: book.largeImageUrl || null,
        publisherName: book.publisherName,
        salesDate: book.salesDate,
        bookId: dbBook?.id ?? null,
        status: (dbBook?.readingStatuses[0]?.status ?? "unread") as
          | "unread"
          | "reading"
          | "read",
        awards: dbBook?.awardEntries.map((e) => ({ name: e.award.name, year: e.year, type: e.type })) ?? [],
      };
    });

    return Response.json(result);
  } catch (error) {
    console.error("[GET /api/favorite-authors/[authorId]/books]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
