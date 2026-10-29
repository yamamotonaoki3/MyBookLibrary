import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { getClientIp } from "@/lib/auditLog";
import { startEnrichment } from "@/lib/bookEnrichmentService";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;
  try {
    const result = await startEnrichment(userId, getClientIp(request));
    if (result.kind === "conflict") {
      return NextResponse.json({ error: "既に補完処理が実行中です。", jobId: result.jobId }, { status: 409 });
    }
    if (result.kind === "empty") {
      return NextResponse.json({ error: "補完が必要な本はありません。" }, { status: 400 });
    }
    return NextResponse.json({ jobId: result.jobId, totalCount: result.totalCount });
  } catch (error) {
    logger.error({ err: error }, "[POST /api/admin/book-enrichment/start]");
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
