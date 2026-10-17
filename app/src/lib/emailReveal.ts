import { AUDIT_EVENT, recordAuditEventOrThrow } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import {
  countRecentReveals,
  findEmailToReveal,
  markRevealDenied,
  type EmailRevealKind,
} from "@/repositories/emailRevealRepository";

/** 1 人の管理者が、1 分間に「表示」できる回数。連続した取得（一括の抜き取り）への対策。 */
export const EMAIL_REVEAL_LIMIT_PER_MINUTE = 20;

const KIND_TO_TARGET_TYPE: Record<EmailRevealKind, string> = {
  user: "User",
  inquiry: "ContactInquiry",
  "audit-log": "AuditLog",
};

export type RevealEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: "rate_limited" | "not_found" };

/**
 * 管理者の「表示」ボタン用。要求のたびに監査ログへ記録する（メールの値は記録しない）。
 * 監査ログに記録できなかったときは、メールを返さずに例外を投げる。
 *
 * 回数制限は「先に記録してから、直近の記録数を数える」順にする。「数えてから記録する」と、
 * 同じ管理者の並列リクエストが、どれも上限未満と判定されて、上限を超えて取得できてしまうため。
 * 先に記録すれば、上限を超えて通れるのは（数える時点で、自分の記録を含めて上限以内の）要求だけになる。
 * 表示させなかった要求の記録には、その旨と理由を残す。
 */
export async function revealEmail(input: {
  adminUserId: number;
  kind: EmailRevealKind;
  id: number;
  ipAddress: string | null;
}): Promise<RevealEmailResult> {
  const auditLogId = await recordAuditEventOrThrow({
    eventType: AUDIT_EVENT.ADMIN_EMAIL_REVEALED,
    actorUserId: input.adminUserId,
    targetType: KIND_TO_TARGET_TYPE[input.kind],
    targetId: input.id,
    ipAddress: input.ipAddress,
  });

  const deny = async (reason: "rate_limited" | "not_found"): Promise<RevealEmailResult> => {
    try {
      await markRevealDenied(auditLogId, reason);
    } catch (err) {
      logger.error({ err, auditLogId }, "表示させなかった記録の更新に失敗しました");
    }
    return { ok: false, reason };
  };

  const since = new Date(Date.now() - 60_000);
  if ((await countRecentReveals(input.adminUserId, since)) > EMAIL_REVEAL_LIMIT_PER_MINUTE) {
    return deny("rate_limited");
  }

  const email = await findEmailToReveal(input.kind, input.id);
  if (!email) return deny("not_found");
  return { ok: true, email };
}
