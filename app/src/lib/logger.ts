import { createConsoleLogger } from "@/lib/logging/consoleLogger";
import { createPinoLogger } from "@/lib/logging/pinoLogger";
import type { Logger } from "@/lib/logging/types";

export type { Logger } from "@/lib/logging/types";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

/**
 * ロガー。実装は `LOG_DRIVER` で選ぶ（既定は pino。`console` なら Node.js 固有の依存を使わない実装）。
 * アプリのコードは `Logger` 型にだけ依存し、実装の詳細（pino）を知らない。
 */
export const logger: Logger =
  process.env.LOG_DRIVER === "console"
    ? createConsoleLogger({ level })
    : createPinoLogger({ level, isProd });
