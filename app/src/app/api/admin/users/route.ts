import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}
