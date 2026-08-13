import { assertAivenDatabaseUrl } from "../../../../prisma/scripts/aivenDbGuard";

describe("assertAivenDatabaseUrl", () => {
  test("Aivenのホスト名を許可する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        "mysql://user:password@mysql-project.aivencloud.com:12345/defaultdb"
      )
    ).not.toThrow();
  });

  test("本番RDSのホスト名を拒否し、実際の接続先を表示する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        "mysql://user:password@production.ap-northeast-1.rds.amazonaws.com:3306/mybooklibrary"
      )
    ).toThrow(
      "実際の接続先: ホスト production.ap-northeast-1.rds.amazonaws.com、ポート 3306、パス /mybooklibrary"
    );
  });

  test("Aivenのドメインを含むだけのホスト名を拒否する", () => {
    expect(() =>
      assertAivenDatabaseUrl("mysql://user:password@mysql.aivencloud.com.example.com:3306/defaultdb")
    ).toThrow("実際の接続先: ホスト mysql.aivencloud.com.example.com");
  });

  test("DATABASE_URLが未設定の場合は問い合わせ前に拒否する", () => {
    expect(() => assertAivenDatabaseUrl(undefined)).toThrow(
      "実際の接続先ホスト: （未設定）"
    );
  });

  test("DATABASE_URLが不正な場合は問い合わせ前に拒否する", () => {
    expect(() => assertAivenDatabaseUrl("not-a-url")).toThrow(
      "実際の接続先ホスト: （解析不能）"
    );
  });
});
