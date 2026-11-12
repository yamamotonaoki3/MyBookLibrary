import { readFileSync } from "node:fs";
import path from "node:path";

export interface MysqlConnectionOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionLimit: number;
  connectTimeout: number;
  acquireTimeout: number;
  ssl?: {
    ca?: string;
    rejectUnauthorized: boolean;
  };
}

const ALLOWED_QUERY_PARAMETERS = new Set([
  "connection_limit",
  "connect_timeout",
  "pool_timeout",
  "sslcert",
  "sslaccept",
]);

function parameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new Error(`Invalid MySQL URL: duplicate ${name} parameter`);
  return values[0];
}

function positiveInteger(value: string | undefined, name: string, defaultValue: number, allowZero = false): number {
  if (value === undefined) return defaultValue;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid MySQL URL: ${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new Error(`Invalid MySQL URL: ${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return parsed;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Invalid MySQL URL encoding");
  }
}

/** Convert a Prisma MySQL URL into the MariaDB adapter's connection-pool options. */
export function mysqlConnectionOptions(databaseUrl: string, schemaDir: string): MysqlConnectionOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Invalid MySQL database URL");
  }
  if (url.protocol !== "mysql:") throw new Error("Unsupported database URL protocol");

  for (const name of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(name)) throw new Error(`Unsupported MySQL URL parameter: ${name}`);
  }

  const rawDatabase = url.pathname.slice(1);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const user = decode(url.username);
  const password = decode(url.password);
  const database = decode(rawDatabase);
  if (!host || !user || !database || database.includes("/")) {
    throw new Error("Invalid MySQL database URL: host, user, and database are required");
  }

  const connectionLimit = positiveInteger(parameter(url, "connection_limit"), "connection_limit", 10);
  const connectTimeoutSeconds = positiveInteger(parameter(url, "connect_timeout"), "connect_timeout", 5, true);
  const poolTimeoutValue = parameter(url, "pool_timeout");
  if (poolTimeoutValue === "0") {
    // mariadb@3 ignores acquireTimeout=0 and falls back to its 10s default.
    throw new Error("Unsupported MySQL URL parameter: pool_timeout=0 cannot be represented by the MariaDB adapter");
  }
  const poolTimeoutSeconds = positiveInteger(poolTimeoutValue, "pool_timeout", 10);

  const sslcert = parameter(url, "sslcert");
  const sslaccept = parameter(url, "sslaccept");
  if (sslaccept !== undefined && sslaccept !== "strict" && sslaccept !== "accept_invalid_certs") {
    throw new Error("Unsupported MySQL TLS verification mode");
  }

  let ssl: MysqlConnectionOptions["ssl"];
  if (sslcert !== undefined || sslaccept !== undefined) {
    ssl = { rejectUnauthorized: sslaccept !== "accept_invalid_certs" };
    if (sslcert !== undefined) {
      if (!sslcert) throw new Error("Invalid MySQL URL: sslcert must not be empty");
      if (!path.isAbsolute(schemaDir)) throw new Error("Invalid MySQL schema directory");
      const caPath = path.isAbsolute(sslcert) ? sslcert : path.resolve(schemaDir, sslcert);
      try {
        ssl.ca = readFileSync(caPath, "utf8");
      } catch {
        throw new Error("Unable to read MySQL sslcert CA file");
      }
    }
  }

  const options: MysqlConnectionOptions = {
    host,
    port: url.port ? Number(url.port) : 3306,
    database,
    user,
    password,
    connectionLimit,
    connectTimeout: connectTimeoutSeconds * 1000,
    acquireTimeout: poolTimeoutSeconds * 1000,
  };
  if (ssl) options.ssl = ssl;
  return options;
}
