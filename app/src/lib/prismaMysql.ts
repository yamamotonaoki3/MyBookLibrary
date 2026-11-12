import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma";
import { mysqlConnectionOptions } from "./mysqlConnectionConfig";

type PrismaLogLevel = "query" | "info" | "warn" | "error";

export function createMysqlPrisma(
  databaseUrl: string,
  options?: { log?: PrismaLogLevel[] }
): PrismaClient {
  // __dirname points into Next's emitted server bundle after production build; cwd is the app root in both
  // source execution and the standalone image, where Docker copies prisma/ alongside the server.
  const adapterOptions = mysqlConnectionOptions(databaseUrl, path.resolve(process.cwd(), "prisma"));
  const adapter = new PrismaMariaDb(adapterOptions);
  return new PrismaClient({
    adapter,
    ...(options?.log ? { log: options.log } : {}),
  });
}
