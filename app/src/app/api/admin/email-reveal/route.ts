import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { getClientIp } from "@/lib/auditLog";
import { revealEmail } from "@/lib/emailReveal";
import { logger } from "@/lib/logger";

const BodySchema = z.object({
  kind: z.enum(["user", "inquiry", "audit-log"]),
  id: z.number().int().positive(),
});

/** 管理者が「表示」ボタンを押したときだけ、メールアドレスの全体を返す（取得のたびに監査ログへ記録）。 */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  try {
    const result = await revealEmail({ adminUserId: userId, ...parsed.data, ipAddress: getClientIp(req) });
    if (!result.ok) {
      return result.reason === "rate_limited"
        ? NextResponse.json({ error: "短時間に表示しすぎです。しばらくしてからお試しください。" }, { status: 429 })
        : NextResponse.json({ error: "対象が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ email: result.email }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err }, "[POST /api/admin/email-reveal]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
