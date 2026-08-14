import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDump } from "@/lib/migration/dumpParser";

const fixturePath = join(__dirname, "fixtures", "sample-dump.sql");
const sampleDump = readFileSync(fixturePath, "utf-8");

describe("parseDump", () => {
  it("テーブルごとのINSERT INTO件数を正しくカウントする", () => {
    const result = parseDump(sampleDump);

    const users = result.find((t) => t.tableName === "users");
    expect(users?.expectedRowCount).toBe(3);

    const books = result.find((t) => t.tableName === "books");
    expect(books?.expectedRowCount).toBe(2);

    const migrations = result.find((t) => t.tableName === "_prisma_migrations");
    expect(migrations?.expectedRowCount).toBe(3);
  });

  it("INSERT文が無いテーブルは0件として扱う", () => {
    const result = parseDump(sampleDump);
    const accounts = result.find((t) => t.tableName === "accounts");
    expect(accounts?.expectedRowCount).toBe(0);
  });

  it("CREATE TABLE文のAUTO_INCREMENTオプションを抽出する", () => {
    const result = parseDump(sampleDump);

    const users = result.find((t) => t.tableName === "users");
    expect(users?.expectedAutoIncrement).toBe(5);

    const books = result.find((t) => t.tableName === "books");
    expect(books?.expectedAutoIncrement).toBe(10);
  });

  it("AUTO_INCREMENT列を持たないテーブルはnullを返す", () => {
    const result = parseDump(sampleDump);
    const accounts = result.find((t) => t.tableName === "accounts");
    expect(accounts?.expectedAutoIncrement).toBeNull();
  });

  it("AUTO_INCREMENTオプションが省略されAUTO_INCREMENT列を持つ場合は1を返す", () => {
    const dumpWithoutOption = `
CREATE TABLE \`awards\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(191) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO \`awards\` (\`id\`, \`name\`) VALUES (1, 'テスト賞');
`;
    const result = parseDump(dumpWithoutOption);
    const awards = result.find((t) => t.tableName === "awards");
    expect(awards?.expectedAutoIncrement).toBe(1);
    expect(awards?.expectedRowCount).toBe(1);
  });

  it("空文字列を渡した場合は空配列を返す", () => {
    expect(parseDump("")).toEqual([]);
  });
});
