import { FOREIGN_KEYS, buildOrphanQuery } from "@/lib/migration/foreignKeys";

describe("buildOrphanQuery", () => {
  it("NULL許容な外部キー列には子側のIS NOT NULLフィルタを付与する", () => {
    const booksCreatedBy = FOREIGN_KEYS.find(
      (fk) => fk.tableName === "books" && fk.columnName === "created_by_user_id"
    );
    expect(booksCreatedBy).toBeDefined();

    const sql = buildOrphanQuery(booksCreatedBy!);
    expect(sql).toContain("AND c.`created_by_user_id` IS NOT NULL");
    expect(sql).toContain("LEFT JOIN `users` p ON c.`created_by_user_id` = p.`id`");
    expect(sql).toContain("WHERE p.`id` IS NULL");
  });

  it("NOT NULLな外部キー列には子側のフィルタを付与しない", () => {
    const booksAuthor = FOREIGN_KEYS.find(
      (fk) => fk.tableName === "books" && fk.columnName === "author_id"
    );
    expect(booksAuthor).toBeDefined();

    const sql = buildOrphanQuery(booksAuthor!);
    expect(sql).not.toContain("IS NOT NULL");
  });

  it("全ての外部キー定義に対してSQLが例外なく組み立てられる", () => {
    for (const fk of FOREIGN_KEYS) {
      expect(() => buildOrphanQuery(fk)).not.toThrow();
    }
  });
});
