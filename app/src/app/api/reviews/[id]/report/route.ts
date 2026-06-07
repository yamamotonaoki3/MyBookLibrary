import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const reviewId = Number(id);
  if (isNaN(reviewId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.report.findUnique({
      where: { userId_reviewId: { userId: TEMP_USER_ID, reviewId } },
    });
    if (existing) {
      return Response.json({ error: "すでに通報済みです" }, { status: 409 });
    }

    await prisma.report.create({
      data: { userId: TEMP_USER_ID, reviewId },
    });
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
    await prisma.report.deleteMany({
      where: { userId: TEMP_USER_ID, reviewId },
    });
    return Response.json({ reported: false });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
