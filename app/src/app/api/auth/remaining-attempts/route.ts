import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LOCK_THRESHOLD = 10;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ remaining: null });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { loginFailCount: true },
  });

  if (!user) {
    return NextResponse.json({ remaining: null });
  }

  const remaining = LOCK_THRESHOLD - user.loginFailCount;
  return NextResponse.json({ remaining: remaining > 0 ? remaining : 0 });
}
