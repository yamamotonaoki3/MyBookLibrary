import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AuditEventType } from "@/lib/auditEvents";

export { AUDIT_EVENT, AUDIT_EVENT_LABEL } from "@/lib/auditEvents";
export type { AuditEventType } from "@/lib/auditEvents";

type RecordAuditEventInput = {
  eventType: AuditEventType;
  actorUserId?: number | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  detail?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

/**
 * セキュリティ監査ログを記録する。pinoログ（CloudWatch集約用）とDB書き込み
 * （admin画面閲覧用）の二重記録を行う。DB書き込みが失敗しても、呼び出し元の
 * 本処理（削除・パスワード変更等）を巻き込んで失敗させない。
 */
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  logger.info({ audit: true, ...input }, `audit: ${input.eventType}`);

  try {
    await prisma.auditLog.create({
      data: {
        eventType: input.eventType,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, eventType: input.eventType }, "監査ログのDB保存に失敗しました");
  }
}

/** CloudFront等のプロキシ経由のX-Forwarded-Forからクライアント実IPを取り出す */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || null;
}
