import { NextRequest, NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demoMode";
import { resetDemoEnvironment } from "@/lib/demo/resetDemo";
import { logger } from "@/lib/logger";

const MIN_CRON_SECRET_LENGTH = 16;

/**
 * デモ環境の定期的な初期化（Cron Trigger から Bearer 認証で呼ばれる）。DEMO_MODE=true のときだけ動く（それ以外は 404）。
 * 初期化の対象は、`demo_` のユーザーと、そのユーザーのデータだけ（src/lib/demo/seed.ts）。
 */
export async function GET(req: NextRequest) {
  // デモ環境以外（本番・ステージング・ローカル）では、存在しないものとして扱う
  if (!isDemoMode()) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    logger.error("CRON_SECRET is not configured or too short");
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await resetDemoEnvironment();
    return NextResponse.json({ ok: true, users: summary.users, counts: summary.counts });
  } catch (err) {
    // 例外の内容（値を含み得る）は、ログにだけ出し、応答には含めない
    logger.error({ err }, "[GET /api/cron/reset-demo] failed");
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
