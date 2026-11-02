import type { PrismaClient } from "@/generated/prisma";

/**
 * アプリ全体で使う Prisma クライアント。
 *
 * DB_PROVIDER で接続先を切り替える（ビルド時に決まる。next.config.ts の env で埋め込まれる）。
 *   - mysql（既定）… MySQL（RDS・ローカルの Docker）へ直接接続する。
 *   - d1 … Cloudflare D1。バインディングからリクエストごとに生成する（prismaD1.ts）。
 * 呼び出し側は DB の種類を意識しない。使わない側の実装はバンドルに含まれない。
 */

export const prisma: PrismaClient =
  process.env.DB_PROVIDER === "d1"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/prismaD1") as typeof import("@/lib/prismaD1")).createD1Prisma()
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/prismaMysqlSingleton") as typeof import("@/lib/prismaMysqlSingleton")).createLazyMysqlPrisma();
