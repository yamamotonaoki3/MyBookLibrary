import { getAuthenticatedUserId } from "@/lib/session";
import { getRecommendedAuthors } from "@/lib/recommendations";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const recommendations = await getRecommendedAuthors(userId);

    return Response.json(recommendations);
  } catch (error) {
    logger.error({ err: error }, "[GET /api/favorite-authors/recommendations]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
