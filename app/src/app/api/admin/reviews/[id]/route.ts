import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { book: true },
    });
    if (!review) {
      return Response.json({ error: "レビューが見つかりません。" }, { status: 404 });
    }
    await prisma.notification.create({
      data: {
        userId: review.userId,
        type: "review_deleted",
        content: "不適切な内容があったため、レビューは削除されました。",
        bookIsbn: review.book.isbn ?? null,
        bookTitle: review.book.title,
      },
    });
    await prisma.review.delete({ where: { id: reviewId } });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
