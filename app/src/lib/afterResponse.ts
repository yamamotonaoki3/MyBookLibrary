import { after } from "next/server";
import { logger } from "@/lib/logger";

/**
 * レスポンス送信後に実行したい処理を登録する。
 * Next.js の `after()` を使い、リクエストの処理時間に含めない。
 * 失敗してもレスポンスには影響させず、ログに残すだけにする。
 * リクエストスコープ外（スクリプト・テスト等）で `after()` が使えない場合は、
 * 待たずに即時実行する。
 */
export function runAfterResponse(task: () => Promise<void>): void {
  const safeTask = async () => {
    try {
      await task();
    } catch (err) {
      logger.error({ err }, "[afterResponse] deferred task failed");
    }
  };
  try {
    after(safeTask);
  } catch {
    void safeTask();
  }
}
