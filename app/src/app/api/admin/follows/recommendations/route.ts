import { getRecommendedUsers } from "@/lib/userRecommendations";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const recommendations = await getRecommendedUsers(userId);

  return NextResponse.json(recommendations);
}
