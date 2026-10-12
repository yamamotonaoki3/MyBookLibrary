import type { LogLevel, Logger } from "./types";

/**
 * `console` だけで動くロガー（Cloudflare Workers など、Node.js 固有の依存を避けたい環境向け）。
 * pino と同じく 1 行の JSON を出し、同じキーを伏せ字にする。
 */

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** pino が受け付ける LOG_LEVEL の値も同じ意味で扱う（silent は何も出さない）。 */
const THRESHOLD_BY_NAME: Record<string, number> = {
  trace: 5,
  ...LEVEL_ORDER,
  fatal: 50,
  silent: Number.POSITIVE_INFINITY,
};
const REDACTED = "[REDACTED]";

/** pino の redact 設定（password / secretWord / authorization と、1 階層下の password / secretWord / token）と同じ。 */
const TOP_LEVEL_SECRET_KEYS = new Set(["password", "secretWord", "authorization"]);
const NESTED_SECRET_KEYS = new Set(["password", "secretWord", "token"]);

function serializeError(err: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = { type: err.name, message: err.message, stack: err.stack };
  for (const key of Object.keys(err)) serialized[key] = (err as unknown as Record<string, unknown>)[key];
  return serialized;
}

/** 1 階層下のキー（password / secretWord / token）を伏せ字にする。 */
function redactNested(fields: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    nested[key] = NESTED_SECRET_KEYS.has(key) ? REDACTED : value;
  }
  return nested;
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (TOP_LEVEL_SECRET_KEYS.has(key)) {
      result[key] = REDACTED;
    } else if (value instanceof Error) {
      result[key] = redactNested(serializeError(value));
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactNested(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** BigInt や循環参照を含んでいても、ログ出力自体が例外にならないように JSON 化する（再出現したオブジェクトは "[Circular]" にする）。 */
function safeStringify(value: Record<string, unknown>): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v !== null && typeof v === "object") {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
  } catch {
    return JSON.stringify({ level: value.level, time: value.time, msg: "ログの JSON 化に失敗しました" });
  }
}

export function createConsoleLogger(options: { level: string }): Logger {
  const threshold = THRESHOLD_BY_NAME[options.level] ?? LEVEL_ORDER.info;

  const make = (level: LogLevel) => (first: Record<string, unknown> | string, message?: string) => {
    if (LEVEL_ORDER[level] < threshold) return;
    const fields = typeof first === "string" ? {} : redactFields(first);
    const msg = typeof first === "string" ? first : message;
    console[level](
      safeStringify({ level, time: new Date().toISOString(), ...fields, ...(msg !== undefined && { msg }) })
    );
  };

  return { debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error") };
}
