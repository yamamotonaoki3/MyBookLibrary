/**
 * アプリ全体で使うロガーの型。実装（pino・console 等）はこの型にだけ従えばよい。
 * 呼び出し側は `logger.error({ err, userId }, "メッセージ")` または `logger.info("メッセージ")` の形で使う。
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMethod = {
  (fields: Record<string, unknown>, message?: string): void;
  (message: string): void;
};

export type Logger = Record<LogLevel, LogMethod>;
