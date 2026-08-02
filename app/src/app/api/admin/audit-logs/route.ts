import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { AuditLogQuerySchema } from "@/lib/validations";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const parsed = AuditLogQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { eventType, actorUserId, from, to, page, pageSize } = parsed.data;

  // "to" は日付のみ（例: 2026-08-01）で、日本時間（JST, UTC+9）の日付として扱う。
  // 終了日を含めるため、翌日00:00（JST）を排他的上限として使う。
  const toExclusive = to ? new Date(`${to}T00:00:00+09:00`) : undefined;
  toExclusive?.setUTCDate(toExclusive.getUTCDate() + 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(eventType && { eventType }),
    ...(actorUserId && { actorUserId }),
    ...((from || toExclusive) && {
      createdAt: {
        ...(from && { gte: new Date(`${from}T00:00:00+09:00`) }),
        ...(toExclusive && { lt: toExclusive }),
      },
    }),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actorUser: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    logger.error({ err: error }, "[GET /api/admin/audit-logs]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
