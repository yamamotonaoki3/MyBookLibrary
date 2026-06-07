import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const statuses = await prisma.readingStatus.findMany({
    where: {
      userId: TEMP_USER_ID,
      status: { in: ["reading", "read"] },
      ...(q ? { book: { title: { contains: q } } } : {}),
    },
    include: { book: { include: { author: { select: { name: true } } } } },
  });

  return Response.json(statuses.map((rs) => rs.book));
}
