import type { PrismaClient } from "@/generated/prisma";

/**
 * アプリ全体で使う Prisma クライアント。
 *
 * DB_PROVIDER で接続先を切り替える（ビルド時に決まる。next.config.ts の env で埋め込まれる）。
 *   - mysql（既定）… MySQL（RDS・ローカルの Docker）へ直接接続する。
 *   - d1 … Cloudflare D1。バインディングからリクエストごとに生成する（prismaD1.ts）。
 * 呼び出し側は DB の種類を意識しない。使わない側の実装はバンドルに含まれない。
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createMysqlPrisma(): PrismaClient {
  // D1 向けのビルドに MySQL 用の生成クライアントが含まれないよう、使う側で読み込む
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: MysqlPrismaClient } = require("@/generated/prisma") as typeof import("@/generated/prisma");
  const client =
    globalForPrisma.prisma ??
    new MysqlPrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const prisma: PrismaClient =
  process.env.DB_PROVIDER === "d1"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/prismaD1") as typeof import("@/lib/prismaD1")).createD1Prisma()
    : createMysqlPrisma();
