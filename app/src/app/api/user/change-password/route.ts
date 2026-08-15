import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { ChangePasswordSchema } from "@/lib/validations";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";

export async function POST(request: Request) {
  const { userId, error } = await getAuthenticatedUserId({ allowMustChangePassword: true });
  if (error) return error;

  const body = await request.json();
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return Response.json({ error: errors }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) {
    return Response.json(
      { error: "この操作はパスワードでログインしているアカウントのみ利用できます" },
      { status: 422 }
    );
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) {
    return Response.json({ error: "現在のパスワードが正しくありません" }, { status: 401 });
  }

  // 強制リセットされた一時パスワードをそのまま「新しいパスワード」として
  // 再登録し、mustChangePasswordの要求を実質無効化できてしまうのを防ぐ
  const sameAsCurrent = await bcrypt.compare(parsed.data.password, user.password);
  if (sameAsCurrent) {
    return Response.json(
      { error: { password: ["現在のパスワードとは異なるパスワードを入力してください"] } },
      { status: 400 }
    );
  }

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      mustChangePassword: false,
      loginFailCount: 0,
      lockedUntil: null,
    },
  });

  await recordAuditEvent({
    eventType: AUDIT_EVENT.PASSWORD_RESET_COMPLETED,
    actorUserId: userId,
    actorEmail: user.email,
    ipAddress: getClientIp(request),
  });

  return Response.json({ ok: true });
}
