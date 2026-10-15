import { PrismaD1 } from "@prisma/adapter-d1";
import type { PrismaClient } from "@/generated/prisma";
import { getD1Binding, getRequestScope } from "@/lib/d1Binding";
import { createPerBindingProxy } from "@/lib/perBindingProxy";

/**
 * DB_PROVIDER=d1 のときだけ読み込まれる、D1 用の Prisma クライアント。
 * Workers で動くよう、エンジン不要（wasm）の生成物を使う（`engineType = "client"`。docs/cloudflare-d1-migration-plan.md §4-7）。
 * 生成: `npm run prisma:generate:d1`（postinstall でも実行される）。
 */
type D1ClientModule = { PrismaClient: new (options: { adapter: unknown; log?: string[] }) => unknown };

// 実行環境（D1_RUNTIME）で読み込む生成物を選ぶ。値はビルド時に埋め込まれ、使わない側はバンドルから除かれる。
//   - workers（既定）… Workers 向けの wasm エントリ。
//   - node … Node.js 上のテスト・スクリプト向け（miniflare のローカル D1 に接続する結合テスト等）。
const { PrismaClient: D1PrismaClient } = (
  process.env.D1_RUNTIME === "node"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/generated/prisma-d1")
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/generated/prisma-d1/wasm")
) as D1ClientModule;

/**
 * D1 用クライアントを、MySQL 版の `PrismaClient` 型として返す。
 * 2 つの生成クライアントの型は相互に代入できない（`$transaction` 等が異なる）ため、
 * アプリ全体で共通の型に揃える明示的なキャストはここ（と prisma.ts）の 1 か所に集約する。
 * モデル定義の同一性は D1 版スキーマのドリフト検査（npm run schema:d1:check）で担保する。
 */
export function createD1Prisma(): PrismaClient {
  // Workers 上では、リクエストごとにクライアントを作る（接続処理の待ちを、リクエスト間で共有しない。#734）
  return createPerBindingProxy(
    getD1Binding,
    (binding) => {
      const adapter = new PrismaD1(binding as ConstructorParameters<typeof PrismaD1>[0]);
      return new D1PrismaClient({ adapter, log: ["error"] }) as unknown as PrismaClient;
    },
    getRequestScope
  );
}
