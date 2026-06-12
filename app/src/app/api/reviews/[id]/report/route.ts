import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";


type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const existing = await prisma.report.findUnique({
      where: { userId_reviewId: { userId: userId, reviewId } },
    });
    if (existing) {
      return Response.json({ error: "すでに通報済みです" }, { status: 409 });
    }

    await prisma.report.create({
      data: { userId: userId, reviewId },
    });

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { book: true },
    });
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true },
    });
    if (review && admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "report",
          content: `「${review.book.title}」のレビューが通報されました。`,
          bookIsbn: review.book.isbn ?? null,
        })),
      });
    }

    return Response.json({ reported: true });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    await prisma.report.deleteMany({
      where: { userId: userId, reviewId },
    });
    return Response.json({ reported: false });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
