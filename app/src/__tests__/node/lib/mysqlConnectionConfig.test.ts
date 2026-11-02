import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mysqlConnectionOptions } from "@/lib/mysqlConnectionConfig";

describe("mysqlConnectionOptions", () => {
  it("decodes a MySQL URL and maps pool and timeout values to MariaDB options", () => {
    expect(
      mysqlConnectionOptions(
        "mysql://testuser:p%40ss@localhost:3307/mybooklibrary_test?connection_limit=5&connect_timeout=5&pool_timeout=10",
        "C:/app/prisma"
      )
    ).toMatchObject({
      host: "localhost",
      port: 3307,
      database: "mybooklibrary_test",
      user: "testuser",
      password: "p@ss",
      connectionLimit: 5,
      connectTimeout: 5000,
      acquireTimeout: 10000,
    });
  });

  it("uses explicit safe defaults and decodes IPv6 and database names once", () => {
    expect(mysqlConnectionOptions("mysql://u%40ser:p%2521@[::1]/my%20library", "C:/app/prisma")).toMatchObject({
      host: "::1",
      port: 3306,
      database: "my library",
      user: "u@ser",
      password: "p%21",
      connectionLimit: 10,
      connectTimeout: 5000,
      acquireTimeout: 10000,
    });
  });

  it("reads a CA relative to schemaDir and keeps strict TLS verification independent of cwd", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mysql-ca-gate-"));
    const schemaDir = path.join(root, "prisma");
    mkdirSync(schemaDir);
    const ca = "-----BEGIN CERTIFICATE-----\nfake test CA\n-----END CERTIFICATE-----\n";
    writeFileSync(path.join(schemaDir, "ca.pem"), ca);
    const url = `mysql://user:pass@localhost/library?sslcert=${encodeURIComponent("ca.pem")}&sslaccept=strict`;
    const cwd = process.cwd();

    try {
      process.chdir(os.tmpdir());
      const options = mysqlConnectionOptions(url, schemaDir);
      expect(options.ssl).toEqual({ ca, rejectUnauthorized: true });
      expect(readFileSync(path.join(schemaDir, "ca.pem"), "utf8")).toBe(ca);
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps explicitly accepted invalid certificates to MariaDB's rejectUnauthorized option", () => {
    const options = mysqlConnectionOptions(
      "mysql://user:pass@localhost/library?sslaccept=accept_invalid_certs",
      "C:/app/prisma"
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it.each([
    "mysql://user:secret@localhost/library?unknown=private",
    "mysql://user:secret@localhost/library?pool_timeout=0",
    "mysql://user:secret@localhost/library?connection_limit=0",
  ])("rejects unsupported or invalid settings without exposing URL credentials", (url) => {
    let message = "";
    try {
      mysqlConnectionOptions(url, "C:/app/prisma");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain("secret");
    expect(message).not.toContain("private");
    expect(message).toMatch(/Invalid|Unsupported|must be/i);
  });
});
