import { getAuthenticatedUserId } from "@/lib/session";
import { getRecommendedUsers } from "@/lib/userRecommendations";

export async function GET() {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const recommendations = await getRecommendedUsers(userId);

    return Response.json(recommendations);
  } catch (error) {
    console.error("[GET /api/follows/recommendations]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
