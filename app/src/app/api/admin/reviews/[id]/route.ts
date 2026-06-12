import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      return Response.json({ error: "レビューが見つかりません。" }, { status: 404 });
    }
    await prisma.review.delete({ where: { id: reviewId } });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
