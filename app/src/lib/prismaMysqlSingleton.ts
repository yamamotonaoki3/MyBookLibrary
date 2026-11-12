import type { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
let mysqlPrisma: PrismaClient | undefined;

function createMysqlPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (mysqlPrisma) return mysqlPrisma;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the MySQL provider");
  // D1向けのbuildでMySQL factory/driverを読み込まないようClient利用時に限って読み込む。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMysqlPrisma: createMysqlClient } = require("@/lib/prismaMysql") as typeof import("@/lib/prismaMysql");
  const client = createMysqlClient(databaseUrl, {
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  mysqlPrisma = client;
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export function createLazyMysqlPrisma(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client = createMysqlPrisma();
      const value = Reflect.get(client, property, client) as unknown;
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}
