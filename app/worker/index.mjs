// OpenNext の Worker に Cron Trigger の `scheduled` ハンドラを足したカスタムエントリ。
// `fetch` は OpenNext のものに委譲する。ビルド（opennextjs-cloudflare build）の後に、wrangler の main として使う
// （設定は Phase 3 の P3-1 で wrangler.jsonc に追加する）。ロジックは src/lib/cronScheduler.ts（単体・結合テスト済み）。
import openNextWorker from "../.open-next/worker.js";
import { createScheduledHandler } from "../src/lib/cronScheduler.ts";

// OpenNext が使う Durable Object のクラスは、エントリから再エクスポートする必要がある
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

const worker = {
  fetch: openNextWorker.fetch,
  scheduled: createScheduledHandler(openNextWorker.fetch),
};

export default worker;
