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

    // DBのReadingStatusをISBNで照合
    const isbnList = rakutenBooks.map((b) => b.isbn).filter(Boolean);
    const books = await prisma.book.findMany({
      where: { isbn: { in: isbnList } },
      select: {
        isbn: true,
        readingStatuses: {
          where: { userId: TEMP_USER_ID },
          select: { status: true },
        },
      },
    });

    const statusByIsbn = new Map(
      books.map((b) => [b.isbn, b.readingStatuses[0]?.status ?? "unread"])
    );

    const result = rakutenBooks.map((book) => ({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      coverImageUrl: book.largeImageUrl || null,
      publisherName: book.publisherName,
      salesDate: book.salesDate,
      status: (statusByIsbn.get(book.isbn) ?? "unread") as
        | "unread"
        | "reading"
        | "read",
    }));

    return Response.json(result);
  } catch (error) {
    console.error("[GET /api/favorite-authors/[authorId]/books]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
