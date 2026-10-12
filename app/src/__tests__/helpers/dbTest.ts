/**
 * 実DB統合テスト（`*.itest.ts`）専用のヘルパー。
 *
 * `jest.global-setup.integration.ts` が `.env.test` の読み込みと
 * `prisma migrate deploy` まで済ませた後、各テストファイルはここの
 * `resetDb()` でテーブルを空にしてから使う。
 * Playwright の `e2e/global-setup.ts`（E2E用DBのリセット）からも共用する。
 *
 * **このファイルは integration project の *.itest.ts と Playwright の
 * globalSetup 以外から import しない。** 実際に `prisma.$executeRawUnsafe` で
 * DB に書き込むため、モックしたテスト（node/jsdom project）で誤って import
 * すると実DBへの接続を試みてしまう。
 */
// Playwright（e2e/global-setup.ts）は ts-jest の moduleNameMapper（"@/..."）を
// 解決できないため、ここは相対パスで import する。
import { Prisma, PrismaClient } from "../../generated/prisma";
import { assertTestDatabaseUrl, EXPECTED_TEST_DB_NAME } from "./testDbGuard";

/**
 * D1 版（DB_PROVIDER=d1。integration-d1 project）かどうか。
 * D1 版では、ローカルの D1（miniflare）に対して同じテストを実行する。本番・開発の D1 には接続しない。
 */
export const isD1 = process.env.DB_PROVIDER === "d1";

/** MySQL 専用のテスト（MySQL 固有の機能を検証するもの）を、D1 版では除外する。 */
export const describeFor = (dbs: ("mysql" | "d1")[]) => (dbs.includes(isD1 ? "d1" : "mysql") ? describe : describe.skip);
export const itFor = (dbs: ("mysql" | "d1")[]) => (dbs.includes(isD1 ? "d1" : "mysql") ? it : it.skip);

if (!isD1) assertTestDatabaseUrl(process.env.DATABASE_URL);

type D1Handle = { binding: object; dispose: () => Promise<void> };
let d1Handle: D1Handle | undefined;

/** D1 版のテスト用クライアント。miniflare のローカル D1 を、テストファイルごとに起動・終了する。 */
function createD1TestPrisma(): PrismaClient {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PrismaD1 } = require("@prisma/adapter-d1");
  const { PrismaClient: D1PrismaClient } = require("../../generated/prisma-d1");
  const { registerD1Binding, getD1Binding } = require("../../lib/d1Binding");
  const { createPerBindingProxy } = require("../../lib/perBindingProxy");
  const { getD1TestConfigPath, getD1TestPersistDir } = require("./d1TestConfig");
  const path = require("node:path");
  /* eslint-enable @typescript-eslint/no-require-imports */

  beforeAll(async () => {
    const { getPlatformProxy } = await import("wrangler");
    const proxy = await getPlatformProxy<{ DB: object }>({
      configPath: getD1TestConfigPath(),
      persist: { path: path.join(getD1TestPersistDir(), "v3") },
    });
    registerD1Binding(proxy.env.DB);
    d1Handle = { binding: proxy.env.DB, dispose: () => proxy.dispose() };
  });

  const client = createPerBindingProxy(getD1Binding, (binding: object) => {
    return new D1PrismaClient({ adapter: new PrismaD1(binding) });
  }) as PrismaClient;

  // テストファイルの afterAll で呼ばれる切断で、miniflare も終了する。
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "$disconnect") {
        return async () => {
          try {
            await target.$disconnect();
          } finally {
            // 切断に失敗しても、miniflare の終了とバインディングの解除は必ず行う（Jest が終了しなくなるのを防ぐ）
            const handle = d1Handle;
            d1Handle = undefined;
            registerD1Binding(undefined);
            await handle?.dispose();
          }
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/** integration テスト全体で共有する PrismaClient。テストファイルの afterAll で切断する。 */
export const testPrisma: PrismaClient = isD1 ? createD1TestPrisma() : new PrismaClient();

/**
 * 全テーブルを TRUNCATE して空にする。
 *
 * テーブル一覧は `information_schema` から動的に取得するため、
 * schema.prisma にモデルが増えても手動でリストを更新する必要がない。
 * `_prisma_migrations` はマイグレーション履歴なので対象から除く。
 */
export async function resetDb(): Promise<void> {
  if (isD1) return resetD1Db();
  assertTestDatabaseUrl(process.env.DATABASE_URL);

  // MySQL は information_schema.tables のカラムを大文字（TABLE_NAME）で返す。
  const tables = await testPrisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${EXPECTED_TEST_DB_NAME}
      AND table_name != '_prisma_migrations'
  `;

  await testPrisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const { TABLE_NAME: tableName } of tables) {
        await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${tableName}\``);
      }
    } finally {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
}

/**
 * D1 版: 全テーブルを空にし、AUTOINCREMENT の採番も戻す（MySQL の TRUNCATE と同じ状態にする）。
 * 外部キーの順序に依存しないよう、1 回の batch（トランザクション）の中で外部キーの検査を遅延させる。
 */
async function resetD1Db(): Promise<void> {
  if (!d1Handle) throw new Error("D1 のテスト用バインディングが初期化されていません（beforeAll の前に resetDb を呼んでいませんか）。");
  const db = d1Handle.binding as {
    prepare(sql: string): { all<T>(): Promise<{ results: T[] }> };
    batch(statements: unknown[]): Promise<unknown>;
  };
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'"
    )
    .all<{ name: string }>();
  const statements = [
    db.prepare("PRAGMA defer_foreign_keys = on"),
    ...results.map(({ name }) => db.prepare(`DELETE FROM "${name}"`)),
    db.prepare("DELETE FROM sqlite_sequence"),
  ];
  await db.batch(statements);
}
