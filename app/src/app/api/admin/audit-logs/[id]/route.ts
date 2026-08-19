import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { logger } from "@/lib/logger";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const logId = Number(id);
  if (Number.isNaN(logId)) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  try {
    const item = await prisma.auditLog.findUnique({
      where: { id: logId },
      include: { actorUser: { select: { id: true, name: true, email: true } } },
    });
    if (!item) {
      return NextResponse.json({ error: "監査ログが見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/audit-logs/[id]]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
