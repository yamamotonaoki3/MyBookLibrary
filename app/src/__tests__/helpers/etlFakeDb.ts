/**
 * ETL のテスト用の、メモリ上の DB（Prisma のモデル操作の最小限を模す）。
 * 移行元の代わり（テストデータの読み出し元）と、移行先の代わりの両方に使う。
 */
import { MIGRATION_TABLES, type Row } from "@/lib/migration/etl/tables";
import type { MigrationClient } from "@/lib/migration/etl/run";



export class FakeDb {
  tables = new Map<string, Row[]>(MIGRATION_TABLES.map((t) => [t.model, []]));
  deleteOrder: string[] = [];
  foreignKeyViolations: Row[] = [];
  sequences: Row[] = [];
  jsonNullCount = 0;

  client(): MigrationClient {
    const client = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql.startsWith("PRAGMA foreign_key_check")) return this.foreignKeyViolations;
        if (sql.includes("JSON_TYPE")) return [{ n: this.jsonNullCount }];
        return this.sequences;
      },
    } as unknown as MigrationClient;
    for (const spec of MIGRATION_TABLES) {
      const rows = () => this.tables.get(spec.model)!;
      (client as unknown as Record<string, unknown>)[spec.model] = {
        findMany: async ({ orderBy, skip, take }: { orderBy: Record<string, "asc">[]; skip: number; take: number }) => {
          const keys = orderBy.map((o) => Object.keys(o)[0]);
          const sorted = [...rows()].sort((x, y) => {
            for (const key of keys) {
              const a = String(x[key]);
              const b = String(y[key]);
              if (a !== b) return a < b ? -1 : 1;
            }
            return 0;
          });
          return sorted.slice(skip, skip + take).map((row) => ({ ...row }));
        },
        createMany: async ({ data }: { data: Row[] }) => {
          rows().push(...data.map((row) => ({ ...row })));
          return { count: data.length };
        },
        count: async () => rows().length,
        deleteMany: async () => {
          this.deleteOrder.push(spec.model);
          const count = rows().length;
          rows().length = 0;
          return { count };
        },
      };
    }
    return client;
  }
}

