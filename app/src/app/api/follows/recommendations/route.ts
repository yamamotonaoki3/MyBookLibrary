import { getAuthenticatedUserId } from "@/lib/session";
import { getRecommendedUsers } from "@/lib/userRecommendations";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const recommendations = await getRecommendedUsers(userId);

    return Response.json(recommendations);
  } catch (error) {
    logger.error({ err: error }, "[GET /api/follows/recommendations]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
