import {
  UNIQUE_CONSTRAINTS,
  buildUniqueDuplicateQuery,
} from "@/lib/migration/uniqueConstraints";

describe("buildUniqueDuplicateQuery", () => {
  it("NULL許容列を含む制約には IS NOT NULL フィルタを付与する", () => {
    const booksIsbn = UNIQUE_CONSTRAINTS.find(
      (c) => c.tableName === "books" && c.columns.includes("isbn")
    );
    expect(booksIsbn).toBeDefined();

    const sql = buildUniqueDuplicateQuery(booksIsbn!);
    expect(sql).toContain("WHERE `isbn` IS NOT NULL");
    expect(sql).toContain("GROUP BY `isbn`");
    expect(sql).toContain("HAVING COUNT(*) > 1");
  });

  it("notifications(user_id, type, book_isbn) は book_isbn のみにNULLフィルタを付与する", () => {
    const notifications = UNIQUE_CONSTRAINTS.find(
      (c) => c.tableName === "notifications"
    );
    expect(notifications).toBeDefined();

    const sql = buildUniqueDuplicateQuery(notifications!);
    expect(sql).toContain("WHERE `book_isbn` IS NOT NULL");
    expect(sql).not.toContain("`user_id` IS NOT NULL");
    expect(sql).toContain("GROUP BY `user_id`, `type`, `book_isbn`");
  });

  it("NULL許容列が無い制約にはWHERE句を付与しない", () => {
    const usersEmail = UNIQUE_CONSTRAINTS.find((c) => c.tableName === "users");
    expect(usersEmail).toBeDefined();

    const sql = buildUniqueDuplicateQuery(usersEmail!);
    expect(sql).not.toContain("WHERE");
    expect(sql).toContain("GROUP BY `email`");
  });

  it("全ての制約に対してSQLが例外なく組み立てられる", () => {
    for (const constraint of UNIQUE_CONSTRAINTS) {
      expect(() => buildUniqueDuplicateQuery(constraint)).not.toThrow();
    }
  });
});
