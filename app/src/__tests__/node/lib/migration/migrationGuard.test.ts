import { assertMigrationTargetAllowed } from "@/lib/migration/migrationGuard";

const ALLOWED_HOST = "mybooklibrary-staging.example-aiven.com";
const PRODUCTION_HOST = "mybooklibrary-prod.example-rds.com";
const VALID_URL = `mysql://testuser_migration:dummy@${ALLOWED_HOST}:3306/testdb`;

describe("assertMigrationTargetAllowed", () => {
  it("許可リストに含まれるホストであれば例外を投げない", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: VALID_URL,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: PRODUCTION_HOST,
      })
    ).not.toThrow();
  });

  it("MIGRATION_TARGET_ALLOWED_HOSTS が未設定なら拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: VALID_URL,
        allowedHostsCsv: undefined,
        productionHost: PRODUCTION_HOST,
      })
    ).toThrow(/MIGRATION_TARGET_ALLOWED_HOSTS/);
  });

  it("DATABASE_URL が未設定なら拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: undefined,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: PRODUCTION_HOST,
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("DATABASE_URL の形式が不正なら拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: "not-a-valid-url",
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: PRODUCTION_HOST,
      })
    ).toThrow(/形式が不正/);
  });

  it("許可リストに含まれていても本番ホスト名と一致する場合は拒否する", () => {
    const productionUrl = `mysql://testuser_migration:dummy@${PRODUCTION_HOST}:3306/testdb`;
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: productionUrl,
        allowedHostsCsv: `${ALLOWED_HOST},${PRODUCTION_HOST}`,
        productionHost: PRODUCTION_HOST,
      })
    ).toThrow(/本番DBホスト名/);
  });

  it("許可リストに含まれないホストは拒否する", () => {
    const otherUrl = "mysql://testuser_migration:dummy@unknown-host.example.com:3306/testdb";
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: otherUrl,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: PRODUCTION_HOST,
      })
    ).toThrow(/許可されていないホスト/);
  });

  it("PRODUCTION_DB_HOST が未設定なら、許可リストに一致するホストでもfail-closedで拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: VALID_URL,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: undefined,
      })
    ).toThrow(/PRODUCTION_DB_HOST/);
  });

  it("PRODUCTION_DB_HOST が空文字なら、fail-closedで拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: VALID_URL,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: "",
      })
    ).toThrow(/PRODUCTION_DB_HOST/);
  });

  it("PRODUCTION_DB_HOST が空白だけなら、fail-closedで拒否する", () => {
    expect(() =>
      assertMigrationTargetAllowed({
        databaseUrl: VALID_URL,
        allowedHostsCsv: ALLOWED_HOST,
        productionHost: "   ",
      })
    ).toThrow(/PRODUCTION_DB_HOST/);
  });
});
