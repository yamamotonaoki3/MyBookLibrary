import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const awards = await prisma.award.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    return Response.json(awards);
  } catch (error) {
    console.error("[GET /api/awards]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
