import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const awardId = parseInt(id, 10);

  if (isNaN(awardId)) {
    return Response.json({ error: "Invalid award ID" }, { status: 400 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  try {
    const awardEntries = await prisma.awardEntry.findMany({
      where: {
        awardId,
        ...(year !== undefined && !isNaN(year) ? { year } : {}),
      },
      orderBy: [{ year: "desc" }, { type: "asc" }],
      select: {
        id: true,
        year: true,
        type: true,
        book: {
          select: {
            id: true,
            title: true,
            coverImageUrl: true,
            publishedAt: true,
            author: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const response = awardEntries.map((entry) => ({
      awardEntryId: entry.id,
      year: entry.year,
      type: entry.type,
      book: {
        id: entry.book.id,
        title: entry.book.title,
        coverImageUrl: entry.book.coverImageUrl,
        publishedAt: entry.book.publishedAt.toISOString(),
        author: {
          id: entry.book.author.id,
          name: entry.book.author.name,
        },
      },
    }));

    return Response.json(response);
  } catch (error) {
    console.error(`[GET /api/awards/${id}/books]`, error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
