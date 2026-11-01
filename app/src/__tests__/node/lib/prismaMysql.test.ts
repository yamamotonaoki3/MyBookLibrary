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
