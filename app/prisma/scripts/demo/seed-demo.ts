/**
 * デモ環境の、架空のユーザーと関係のデータの作成・初期化・件数確認（docs/demo-environment.md、#720）。
 *
 *   npm run demo:seed -- seed   (--local | --remote --d1-name mybooklibrary-demo-db --d1-id <ID>) --yes  … 作成（何度実行しても同じ結果）
 *   npm run demo:seed -- reset  (--local | --remote ...) --yes                                          … デモのユーザーと、そのデータだけを削除
 *   npm run demo:seed -- status (--local | --remote ...)                                                 … 件数を表示（読み取りのみ）
 *
 * 移行先は、デモの D1（名前と ID の両方が一致するリモート）か、ローカルの D1 だけ。本番・ステージングは、接続の前に拒否する。
 * 先に、マスターデータの投入（npm run migration:d1 -- migrate --profile demo ...）が必要（本の ID は、その結果から選ぶ）。
 * 管理者は、環境変数 DEMO_ADMIN_PASSWORD（12 文字以上）があるときだけ作る。値は、コード・出力には出さない。
 * 一般ユーザーのパスワードは、公開してよいデモ用の固定値（src/lib/demo/seedPlan.ts の DEMO_USER_PASSWORD）。
 *
 * 出力は、件数だけ（値は出さない）。
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { assertProfileMatchesTarget, assertWritableTarget, safeErrorMessage } from "@/lib/migration/etl/guard";
import { countDemoData, resetDemoData, seedDemoData, type DemoCounts } from "@/lib/demo/seed";
import { DEFAULT_PERSIST_TO, openD1Target } from "../migration/d1Target";

function printCounts(counts: DemoCounts): void {
  for (const [name, count] of Object.entries(counts)) console.log(`  ${name}: ${count}`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      local: { type: "boolean" },
      remote: { type: "boolean" },
      yes: { type: "boolean" },
      "d1-name": { type: "string" },
      "d1-id": { type: "string" },
      "persist-to": { type: "string" },
    },
  });
  const [command, ...extra] = positionals;
  if (!["seed", "reset", "status"].includes(command) || extra.length > 0) {
    throw new Error("使い方: seed-demo.ts <seed|reset|status> (--local | --remote --d1-name <名前> --d1-id <ID>) [--yes]");
  }
  if ((command === "seed" || command === "reset") && !values.yes) {
    throw new Error("書き込みを伴う操作です。接続先を確認のうえ、--yes を付けて再実行してください。");
  }

  // 本番の確認の指定（--confirm-production）は、このツールでは受け付けない（本番の D1 には、常に拒否する）
  const target = assertWritableTarget({ local: values.local ?? false, remote: values.remote ?? false, d1Name: values["d1-name"], d1Id: values["d1-id"] });
  assertProfileMatchesTarget("demo", target);

  const persistTo = values["persist-to"] ? path.resolve(values["persist-to"]) : DEFAULT_PERSIST_TO;
  // ローカルは、マイグレーション済みの D1 が前提（先にマスターデータを投入しているはず）。ここでは適用しない
  const opened = await openD1Target(target, { applyMigrations: false, persistTo });
  try {
    if (command === "status") {
      console.log("デモのデータの件数:");
      printCounts(await countDemoData(opened.client));
    } else if (command === "reset") {
      const removed = await resetDemoData(opened.client);
      console.log(`デモのユーザー ${removed} 名と、そのデータを削除しました。残りの件数:`);
      printCounts(await countDemoData(opened.client));
    } else {
      const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
      const summary = await seedDemoData(opened.client, { adminPassword });
      console.log(`デモのデータを作成しました（ユーザー ${summary.users} 名${adminPassword ? "、管理者を含む" : "。管理者は作っていません"}）。件数:`);
      printCounts(summary.counts);
    }
  } finally {
    await opened.close();
  }
}

main().catch((error) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});
