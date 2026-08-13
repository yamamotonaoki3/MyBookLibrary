import { assertAivenDatabaseUrl } from "../../../../prisma/scripts/aivenDbGuard";

describe("assertAivenDatabaseUrl", () => {
  const expectedHostname = "mysql-verification.aivencloud.com";

  test("期待するAiven検証用ホスト名との完全一致を許可する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        `mysql://user:password@${expectedHostname}:12345/defaultdb`,
        expectedHostname
      )
    ).not.toThrow();
  });

  test("Aiven上の別サービスのホスト名を拒否する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        "mysql://user:password@mysql-production.aivencloud.com:12345/defaultdb",
        expectedHostname
      )
    ).toThrow("ホスト名が AIVEN_STAGING_HOST と完全一致する必要があります");
  });

  test("本番RDSのホスト名を拒否し、実際の接続先を表示する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        "mysql://user:password@production.ap-northeast-1.rds.amazonaws.com:3306/mybooklibrary",
        expectedHostname
      )
    ).toThrow(
      "実際の接続先: ホスト production.ap-northeast-1.rds.amazonaws.com、ポート 3306、パス /mybooklibrary"
    );
  });

  test("Aivenのドメインを含むだけのホスト名を拒否する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        "mysql://user:password@mysql.aivencloud.com.example.com:3306/defaultdb",
        expectedHostname
      )
    ).toThrow("実際の接続先: ホスト mysql.aivencloud.com.example.com");
  });

  test("DATABASE_URLが未設定の場合は問い合わせ前に拒否する", () => {
    expect(() => assertAivenDatabaseUrl(undefined, expectedHostname)).toThrow(
      "実際の接続先ホスト: （未設定）"
    );
  });

  test("DATABASE_URLが不正な場合は問い合わせ前に拒否する", () => {
    expect(() => assertAivenDatabaseUrl("not-a-url", expectedHostname)).toThrow(
      "実際の接続先ホスト: （解析不能）"
    );
  });

  test("AIVEN_STAGING_HOSTが未設定の場合は問い合わせ前に拒否する", () => {
    expect(() =>
      assertAivenDatabaseUrl(
        `mysql://user:password@${expectedHostname}:12345/defaultdb`,
        undefined
      )
    ).toThrow("AIVEN_STAGING_HOST が設定されていません");
  });
});
