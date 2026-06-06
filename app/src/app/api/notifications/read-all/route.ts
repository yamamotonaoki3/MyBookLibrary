import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function PATCH() {
  try {
    await prisma.notification.updateMany({
      where: { userId: TEMP_USER_ID, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
