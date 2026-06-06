import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function GET() {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: TEMP_USER_ID },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notifications);
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
