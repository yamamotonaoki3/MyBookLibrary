import { EXPECTED_DUMP_TABLES, validateDumpTableSet } from "@/lib/migration/expectedTables";

describe("validateDumpTableSet", () => {
  it("期待されるテーブルが過不足なく揃っていればvalid=trueを返す", () => {
    const result = validateDumpTableSet([...EXPECTED_DUMP_TABLES]);
    expect(result).toEqual({ valid: true, missingTables: [], unexpectedTables: [] });
  });

  it("テーブル一覧の並び順が違っても、集合として一致していればvalidになる", () => {
    const shuffled = [...EXPECTED_DUMP_TABLES].reverse();
    const result = validateDumpTableSet(shuffled);
    expect(result.valid).toBe(true);
  });

  it("空のdump（テーブルが1つも無い）はinvalidとなり、全テーブルがmissingになる", () => {
    const result = validateDumpTableSet([]);
    expect(result.valid).toBe(false);
    expect(result.missingTables).toEqual([...EXPECTED_DUMP_TABLES]);
    expect(result.unexpectedTables).toEqual([]);
  });

  it("一部のテーブルが欠けている場合はinvalidとなり、欠けたテーブル名を報告する", () => {
    const partial = EXPECTED_DUMP_TABLES.filter((table) => table !== "books");
    const result = validateDumpTableSet(partial);
    expect(result.valid).toBe(false);
    expect(result.missingTables).toEqual(["books"]);
  });

  it("想定外のテーブル（follows/audit_logsなど未反映migration由来）が含まれる場合はinvalidとなる", () => {
    const withExtra = [...EXPECTED_DUMP_TABLES, "follows", "audit_logs"];
    const result = validateDumpTableSet(withExtra);
    expect(result.valid).toBe(false);
    expect(result.unexpectedTables).toEqual(["follows", "audit_logs"]);
  });
});
