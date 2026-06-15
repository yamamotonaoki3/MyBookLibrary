import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const reviews = await prisma.review.findMany({
      where: { reports: { some: {} } },
      include: {
        user: { select: { name: true } },
        book: { select: { id: true, title: true } },
        _count: { select: { reports: true } },
      },
      orderBy: { reports: { _count: "desc" } },
    });

    const result = reviews.map((r) => ({
      id: r.id,
      body: r.body,
      reportCount: r._count.reports,
      user: r.user,
      book: r.book,
    }));

    return Response.json(result);
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
