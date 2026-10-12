import pino from "pino";
import type { Logger } from "./types";

/** Node.js（EC2 の standalone など）向け。構造化 JSON を標準出力へ出す。開発時は pino-pretty で整形する。 */
export function createPinoLogger(options: { level: string; isProd: boolean }): Logger {
  return pino({
    level: options.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
    redact: {
      paths: ["password", "*.password", "secretWord", "*.secretWord", "*.token", "authorization"],
      censor: "[REDACTED]",
    },
    ...(options.isProd
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }),
  }) as unknown as Logger;
}
