describe("Prisma provider module initialization", () => {
  it("imports without a database URL and only requires it on first client access", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousProvider = process.env.DB_PROVIDER;
    delete process.env.DATABASE_URL;
    process.env.DB_PROVIDER = "mysql";

    try {
      let client: object | undefined;
      await jest.isolateModulesAsync(async () => {
        ({ prisma: client } = await import("@/lib/prisma"));
      });

      expect(client).toBeDefined();
      expect(() => Reflect.get(client as object, "user")).toThrow(
        "DATABASE_URL is required for the MySQL provider"
      );
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousProvider === undefined) delete process.env.DB_PROVIDER;
      else process.env.DB_PROVIDER = previousProvider;
    }
  });
});
