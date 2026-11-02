import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

jest.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: jest.fn((config) => ({ config })),
}));
jest.mock("@/generated/prisma", () => ({
  PrismaClient: jest.fn((options) => ({ options })),
}));
jest.mock("@/lib/mysqlConnectionConfig", () => ({
  mysqlConnectionOptions: jest.fn(() => ({
    host: "mysql.test",
    port: 3306,
    database: "library_test",
    user: "testuser",
    password: "testpass",
    connectionLimit: 10,
    connectTimeout: 5000,
    acquireTimeout: 10000,
  })),
}));

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma";
import { mysqlConnectionOptions } from "@/lib/mysqlConnectionConfig";
import { createMysqlPrisma } from "@/lib/prismaMysql";

describe("createMysqlPrisma", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes parsed connection options to the adapter and returns the generated client", () => {
    const client = createMysqlPrisma("mysql://testuser:testpass@mysql.test/library_test", { log: ["error"] });

    expect(mysqlConnectionOptions).toHaveBeenCalledWith(
      "mysql://testuser:testpass@mysql.test/library_test",
      path.resolve(process.cwd(), "prisma")
    );
    expect(PrismaMariaDb).toHaveBeenCalledWith(expect.objectContaining({ host: "mysql.test" }));
    expect(PrismaClient).toHaveBeenCalledWith({
      adapter: { config: expect.objectContaining({ host: "mysql.test" }) },
      log: ["error"],
    });
    expect(client).toEqual({
      options: { adapter: { config: expect.objectContaining({ host: "mysql.test" }) }, log: ["error"] },
    });
  });

  it("does not create a client or connect merely by importing the factory", () => {
    expect(PrismaClient).not.toHaveBeenCalled();
    expect(PrismaMariaDb).not.toHaveBeenCalled();
  });

  it("loads the real factory without Jest path aliases and disconnects without a database", () => {
    const appRoot = process.cwd();
    const tempRoot = path.resolve(os.tmpdir());
    const tempDirectory = path.resolve(fs.mkdtempSync(path.join(tempRoot, "prisma-mysql-runtime-")));
    const isInsideTempRoot = tempDirectory.startsWith(`${tempRoot}${path.sep}`);

    try {
      expect(isInsideTempRoot).toBe(true);
      const configPath = path.join(tempDirectory, "tsconfig.json");
      const entryPath = path.join(tempDirectory, "load-factory.ts");
      const tsxCliPath = path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs");
      const factoryPath = path.join(appRoot, "src", "lib", "prismaMysql.ts");
      const successMarker = "PRISMA_MYSQL_FACTORY_RUNTIME_OK";

      fs.writeFileSync(
        configPath,
        JSON.stringify({ compilerOptions: { module: "CommonJS", target: "ES2022" } })
      );
      fs.writeFileSync(
        entryPath,
        [
          `const { createMysqlPrisma } = require(${JSON.stringify(factoryPath)});`,
          "async function main() {",
          '  const client = createMysqlPrisma("mysql://issue809:issue809@localhost:3307/mybooklibrary_test");',
          "  await client.$disconnect();",
          `  console.log(${JSON.stringify(successMarker)});`,
          "}",
          "main().catch((error) => {",
          "  console.error(error);",
          "  process.exitCode = 1;",
          "});",
          "",
        ].join("\n")
      );

      const result = spawnSync(
        process.execPath,
        [tsxCliPath, "--tsconfig", configPath, entryPath],
        { cwd: appRoot, encoding: "utf8", timeout: 20_000, windowsHide: true }
      );

      expect(fs.existsSync(tsxCliPath)).toBe(true);
      if (result.error || result.status !== 0) {
        const diagnostic = result.stderr || result.stdout || result.error?.message || `exit status ${result.status}`;
        throw new Error(`tsx factory child failed: ${diagnostic}`);
      }
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(successMarker);
    } finally {
      if (isInsideTempRoot) fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
  it("uses the explicit migration source URL even when DATABASE_URL points at the target", () => {
    const previousUrl = process.env.DATABASE_URL;
    const sourceUrl = "mysql://source_user:source_pass@localhost/library_source";
    process.env.DATABASE_URL = "mysql://target_user:target_pass@localhost/library_target";
    try {
      createMysqlPrisma(sourceUrl);
      expect(mysqlConnectionOptions).toHaveBeenCalledWith(sourceUrl, path.resolve(process.cwd(), "prisma"));
      expect(mysqlConnectionOptions).not.toHaveBeenCalledWith(process.env.DATABASE_URL, expect.anything());
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });
});
