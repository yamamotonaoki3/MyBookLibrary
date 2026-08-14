import { runVerification, type VerificationDb } from "@/lib/migration/verify";
import type { TableExpectation } from "@/lib/migration/dumpParser";
import { UNIQUE_CONSTRAINTS } from "@/lib/migration/uniqueConstraints";
import { FOREIGN_KEYS } from "@/lib/migration/foreignKeys";

function createPassingDb(overrides: Partial<VerificationDb> = {}): VerificationDb {
  return {
    countRows: jest.fn(async (table: string) => {
      if (table === "_prisma_migrations") return 18;
      if (table === "follows" || table === "audit_logs") return 0;
      if (table === "users") return 3;
      return 0;
    }),
    getAutoIncrement: jest.fn(async () => 5),
    getMaxId: jest.fn(async () => 3),
    queryRaw: jest.fn(async () => []),
    ...overrides,
  };
}

const usersExpectation: TableExpectation = {
  tableName: "users",
  expectedRowCount: 3,
  expectedAutoIncrement: 5,
};

describe("runVerification", () => {
  it("全て期待通りならPASSのみを返す（migratedフェーズ）", async () => {
    const db = createPassingDb();
    const checks = await runVerification({
      expectations: [usersExpectation],
      db,
      phase: "migrated",
    });

    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((c) => c.status === "PASS")).toBe(true);

    const migrationsCheck = checks.find((c) => c.table === "_prisma_migrations");
    expect(migrationsCheck?.expected).toBe("18");

    const followsCheck = checks.find((c) => c.table === "follows");
    expect(followsCheck).toBeDefined();
    expect(followsCheck?.expected).toBe("0");
  });

  it("restoredフェーズでは_prisma_migrationsの期待値が12件になる", async () => {
    const db = createPassingDb({
      countRows: jest.fn(async (table: string) => (table === "_prisma_migrations" ? 12 : 0)),
    });
    const checks = await runVerification({ expectations: [], db, phase: "restored" });

    const migrationsCheck = checks.find((c) => c.table === "_prisma_migrations");
    expect(migrationsCheck?.expected).toBe("12");
    expect(migrationsCheck?.status).toBe("PASS");
  });

  it("restoredフェーズではfollows/audit_logsの検査を行わない", async () => {
    const db = createPassingDb();
    const checks = await runVerification({ expectations: [], db, phase: "restored" });

    expect(checks.some((c) => c.table === "follows" && c.check === "rowCount")).toBe(false);
    expect(checks.some((c) => c.table === "audit_logs" && c.check === "rowCount")).toBe(false);
  });

  it("restoredフェーズでは未反映migrationが追加するUNIQUE制約・外部キーを検査しない", async () => {
    const queryRaw = jest.fn(async (sql: string): Promise<Record<string, unknown>[]> => {
      void sql;
      return [];
    });
    const db = createPassingDb({
      countRows: jest.fn(async (table: string) =>
        table === "_prisma_migrations" ? 12 : 0
      ),
      queryRaw,
    });

    const checks = await runVerification({ expectations: [], db, phase: "restored" });
    const uniqueChecks = checks.filter((check) => check.check === "uniqueDuplicate");
    const orphanChecks = checks.filter((check) => check.check === "orphan");
    const queries = queryRaw.mock.calls.map(([sql]) => sql);

    expect(uniqueChecks).toHaveLength(
      UNIQUE_CONSTRAINTS.filter((constraint) => constraint.tableName !== "follows").length
    );
    expect(orphanChecks).toHaveLength(
      FOREIGN_KEYS.filter(
        (fk) =>
          fk.tableName !== "follows" &&
          fk.tableName !== "audit_logs" &&
          !(fk.tableName === "notifications" && fk.columnName === "actor_id") &&
          !(fk.tableName === "books" && fk.columnName === "created_by_user_id")
      ).length
    );
    expect(queries.some((sql) => sql.includes("FROM `follows`"))).toBe(false);
    expect(queries.some((sql) => sql.includes("FROM `audit_logs`"))).toBe(false);
    expect(queries.some((sql) => sql.includes("c.`actor_id`"))).toBe(false);
    expect(queries.some((sql) => sql.includes("c.`created_by_user_id`"))).toBe(false);
  });

  it("行数が一致しない場合はFAILを返す", async () => {
    const db = createPassingDb({
      countRows: jest.fn(async (table: string) => {
        if (table === "_prisma_migrations") return 18;
        if (table === "users") return 2;
        return 0;
      }),
    });
    const checks = await runVerification({
      expectations: [usersExpectation],
      db,
      phase: "migrated",
    });

    const rowCountCheck = checks.find((c) => c.table === "users" && c.check === "rowCount");
    expect(rowCountCheck?.status).toBe("FAIL");
    expect(rowCountCheck?.expected).toBe("3");
    expect(rowCountCheck?.actual).toBe("2");
  });

  it("AUTO_INCREMENTが最大idを超えない場合はautoIncrementSafetyがFAILになる", async () => {
    const db = createPassingDb({
      getAutoIncrement: jest.fn(async () => 3),
      getMaxId: jest.fn(async () => 5),
    });
    const checks = await runVerification({
      expectations: [usersExpectation],
      db,
      phase: "migrated",
    });

    const safetyCheck = checks.find(
      (c) => c.table === "users" && c.check === "autoIncrementSafety"
    );
    expect(safetyCheck?.status).toBe("FAIL");
  });

  it("UNIQUE制約の重複がある場合はFAILを返し、全制約分の検査結果を含む", async () => {
    const db = createPassingDb({
      queryRaw: jest.fn(async (sql: string) => {
        if (sql.includes("`books`") && sql.includes("`isbn`")) {
          return [{ isbn: "9780000000002", duplicate_count: BigInt(2) }];
        }
        return [];
      }),
    });
    const checks = await runVerification({ expectations: [], db, phase: "migrated" });

    const uniqueChecks = checks.filter((c) => c.check === "uniqueDuplicate");
    expect(uniqueChecks.length).toBe(UNIQUE_CONSTRAINTS.length);

    const booksIsbnCheck = uniqueChecks.find((c) => c.table === "books");
    expect(booksIsbnCheck?.status).toBe("FAIL");
    expect(booksIsbnCheck?.detail).toContain("9780000000002");
    expect(booksIsbnCheck?.detail).toContain('"duplicate_count":"2"');
  });

  it("orphan行が無ければ全FK検査がPASSになる", async () => {
    const db = createPassingDb();
    const checks = await runVerification({ expectations: [], db, phase: "migrated" });

    const orphanChecks = checks.filter((c) => c.check === "orphan");
    expect(orphanChecks.length).toBe(FOREIGN_KEYS.length);
    expect(orphanChecks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("orphan検査結果にbigintが含まれても安全に詳細を生成する", async () => {
    const db = createPassingDb({
      queryRaw: jest.fn(async (sql: string) => {
        if (sql.includes("FROM `reviews` c") && sql.includes("c.`book_id`")) {
          return [{ orphan_value: BigInt(123), orphan_count: BigInt(1) }];
        }
        return [];
      }),
    });

    const checks = await runVerification({ expectations: [], db, phase: "migrated" });
    const orphanCheck = checks.find(
      (check) =>
        check.table === "reviews" &&
        check.check === "orphan" &&
        check.detail?.startsWith("book_id ->")
    );

    expect(orphanCheck?.status).toBe("FAIL");
    expect(orphanCheck?.detail).toContain('"orphan_value":"123"');
    expect(orphanCheck?.detail).toContain('"orphan_count":"1"');
  });

  it("sourceDbを指定すると三者比較の検査が追加される", async () => {
    const db = createPassingDb();
    const sourceDb = createPassingDb();
    const checks = await runVerification({
      expectations: [usersExpectation],
      db,
      phase: "migrated",
      sourceDb,
    });

    const sourceLiveCheck = checks.find((c) => c.check === "sourceLiveRowCount");
    expect(sourceLiveCheck).toBeDefined();
    expect(sourceLiveCheck?.status).toBe("PASS");
  });

  it("_prisma_migrationsの全レコードが完了していればmigrationCompletionはPASSになる", async () => {
    const db = createPassingDb({
      queryRaw: jest.fn(async (sql: string) => {
        if (sql.includes("_prisma_migrations")) {
          return [
            { migration_name: "m1", finished_at: new Date(), rolled_back_at: null },
            { migration_name: "m2", finished_at: new Date(), rolled_back_at: null },
          ];
        }
        return [];
      }),
    });
    const checks = await runVerification({ expectations: [], db, phase: "migrated" });

    const completionCheck = checks.find((c) => c.check === "migrationCompletion");
    expect(completionCheck?.status).toBe("PASS");
  });

  it("finished_atがNULLのレコードがあればmigrationCompletionはFAILになる", async () => {
    const db = createPassingDb({
      queryRaw: jest.fn(async (sql: string) => {
        if (sql.includes("_prisma_migrations")) {
          return [
            { migration_name: "m1", finished_at: new Date(), rolled_back_at: null },
            { migration_name: "m2", finished_at: null, rolled_back_at: null },
          ];
        }
        return [];
      }),
    });
    const checks = await runVerification({ expectations: [], db, phase: "migrated" });

    const completionCheck = checks.find((c) => c.check === "migrationCompletion");
    expect(completionCheck?.status).toBe("FAIL");
    expect(completionCheck?.detail).toContain("m2");
  });

  it("rolled_back_atが設定されたレコードがあればmigrationCompletionはFAILになる", async () => {
    const db = createPassingDb({
      queryRaw: jest.fn(async (sql: string) => {
        if (sql.includes("_prisma_migrations")) {
          return [{ migration_name: "m1", finished_at: new Date(), rolled_back_at: new Date() }];
        }
        return [];
      }),
    });
    const checks = await runVerification({ expectations: [], db, phase: "migrated" });

    const completionCheck = checks.find((c) => c.check === "migrationCompletion");
    expect(completionCheck?.status).toBe("FAIL");
  });

  it("sourceDbを指定しない場合は三者比較の検査を含まない", async () => {
    const db = createPassingDb();
    const checks = await runVerification({
      expectations: [usersExpectation],
      db,
      phase: "migrated",
    });

    expect(checks.some((c) => c.check === "sourceLiveRowCount")).toBe(false);
  });
});
