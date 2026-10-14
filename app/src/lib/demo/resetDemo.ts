/**
 * デモ環境の定期的な初期化（Cron、#721）。`demo_` のユーザーと、そのユーザーが持つデータだけを、初期状態に戻す
 * （seedDemoData と同じ。疎通確認用のユーザー、マスターデータ（賞・本・著者）には触れない。既存の管理者は残す）。
 * 呼び出し側（Route Handler）が、デモ環境であること（DEMO_MODE）と認可を確認する。
 */
import { prisma } from "@/lib/prisma";
import { seedDemoData, type DemoClient, type SeedSummary } from "./seed";

export async function resetDemoEnvironment(): Promise<SeedSummary> {
  return seedDemoData(prisma as unknown as DemoClient, { keepAdmin: true });
}
