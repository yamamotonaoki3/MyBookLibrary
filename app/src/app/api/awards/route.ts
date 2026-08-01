import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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
    logger.error({ err: error }, "[GET /api/awards]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
