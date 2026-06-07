import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await prisma.review.delete({ where: { id: reviewId } });
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
