import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { NextRequest, NextResponse } from "next/server";

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 14): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  }
  return result;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const targetId = Number(id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { email: true, password: true },
  });

  if (!target) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  if (!target.password) {
    return NextResponse.json(
      { error: "このアカウントはGoogleログインのため、パスワードのリセットはできません" },
      { status: 422 }
    );
  }

  const tempPassword = generateTempPassword();
  const hashed = await bcrypt.hash(tempPassword, 12);

  // パスワード更新と通知作成のどちらかが失敗して一時パスワードが失われる
  // （＝管理者も本人も新しいパスワードを知りえずロックアウトする）事態を防ぐため、
  // 一つのトランザクションとして実行する
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: {
        password: hashed,
        mustChangePassword: true,
        loginFailCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.notification.create({
      data: {
        userId: targetId,
        type: "password_reset_by_admin",
        content:
          "管理者によりパスワードがリセットされました。管理者から伝えられた一時パスワードでログインし、パスワードを再設定してください。",
      },
    }),
  ]);

  await recordAuditEvent({
    eventType: AUDIT_EVENT.ADMIN_PASSWORD_RESET_FORCED,
    actorUserId: userId,
    targetType: "User",
    targetId,
    detail: { targetEmail: target.email },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ tempPassword });
}
