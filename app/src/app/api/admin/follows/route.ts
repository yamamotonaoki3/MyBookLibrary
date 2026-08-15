import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: { following: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(follows.map((f) => f.following));
}
