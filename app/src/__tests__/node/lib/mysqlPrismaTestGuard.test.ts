describe("MySQL test client guard", () => {
  it("rejects an unsafe database URL before loading or constructing the adapter", async () => {
    const previousUrl = process.env.DATABASE_URL;
    const previousProvider = process.env.DB_PROVIDER;
    const createMysqlPrisma = jest.fn();

    process.env.DB_PROVIDER = "mysql";
    process.env.DATABASE_URL = "mysql://testuser:testpass@127.0.0.1/not_a_test_database";
    jest.doMock("@/lib/prismaMysql", () => ({ createMysqlPrisma }));
    try {
      await expect(
        jest.isolateModulesAsync(async () => {
          await import("../../helpers/dbTest");
        })
      ).rejects.toThrow();
      expect(createMysqlPrisma).not.toHaveBeenCalled();
    } finally {
      jest.dontMock("@/lib/prismaMysql");
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (previousProvider === undefined) delete process.env.DB_PROVIDER;
      else process.env.DB_PROVIDER = previousProvider;
    }
  });
});
