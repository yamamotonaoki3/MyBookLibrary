import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function getAuthenticatedUserId(): Promise<
  { userId: number; error: null } | { userId: null; error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      userId: null,
      error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }
  return { userId: Number(session.user.id), error: null };
}
