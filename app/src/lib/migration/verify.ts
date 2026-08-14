/**
 * 移行先DBの照合(verify)ロジック本体。DB接続は `VerificationDb` インターフェース経由で
 * 注入するため、実際のDB接続を伴わずにunitテストできる。
 *
 * docs/data-migration-spec-481.md の照合方針:
 *   - 16のアプリケーションテーブルは、dumpから導出した件数・AUTO_INCREMENT値と
 *     移行先の実測値を直接比較する。
 *   - `_prisma_migrations` はrestore直後12件・migrate deploy後18件をアサートする
 *     （dumpの件数をそのまま使わず、フェーズに応じた固定値と比較する）。
 *   - `follows`・`audit_logs` はmigrate deploy後・トラフィック切替前段階で
 *     `COUNT(*) = 0` をアサートする（dumpには存在しない新規テーブルのため）。
 *   - UNIQUE制約重複・外部キーorphanは、テーブルの行数比較とは独立に検査する。
 *     restore直後は未反映migrationで追加される制約を除外し、migrate deploy後は全件検査する。
 */
import type { TableExpectation } from "./dumpParser";
import {
  UNIQUE_CONSTRAINTS,
  buildUniqueDuplicateQuery,
  type UniqueConstraint,
} from "./uniqueConstraints";
import {
  FOREIGN_KEYS,
  buildOrphanQuery,
  type ForeignKeyDefinition,
} from "./foreignKeys";

export type Phase = "restored" | "migrated";

export type CheckKind =
  | "rowCount"
  | "autoIncrement"
  | "autoIncrementSafety"
  | "uniqueDuplicate"
  | "orphan"
  | "sourceLiveRowCount"
  | "migrationCompletion";

export interface VerificationCheck {
  table: string;
  check: CheckKind;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  detail?: string;
}

export interface VerificationDb {
  countRows(table: string): Promise<number>;
  /** AUTO_INCREMENT列を持たないテーブルは null を返す。 */
  getAutoIncrement(table: string): Promise<number | null>;
  /** 対象テーブルに行が無い場合は null を返す。 */
  getMaxId(table: string): Promise<number | null>;
  /** SQLを実行し、結果行を返す（0件なら空配列）。UNIQUE重複・orphan検査に使う。 */
  queryRaw(sql: string): Promise<Record<string, unknown>[]>;
}

const SPECIAL_TABLES = ["_prisma_migrations", "follows", "audit_logs"] as const;
const PRISMA_MIGRATIONS_TABLE = "_prisma_migrations";
const NEW_EMPTY_TABLES = ["follows", "audit_logs"] as const;
const PRODUCTION_MIGRATIONS_COUNT = 12;
const TOTAL_MIGRATIONS_COUNT = 18;

function isSpecialTable(tableName: string): boolean {
  return (SPECIAL_TABLES as readonly string[]).includes(tableName);
}

/** 本番dumpに含まれない6件のmigrationで追加されるUNIQUE制約かを返す。 */
export function isPendingMigrationUniqueConstraint(
  constraint: UniqueConstraint
): boolean {
  return constraint.tableName === "follows";
}

/** 本番dumpに含まれない6件のmigrationで追加される外部キーかを返す。 */
export function isPendingMigrationForeignKey(fk: ForeignKeyDefinition): boolean {
  return (
    fk.tableName === "follows" ||
    fk.tableName === "audit_logs" ||
    (fk.tableName === "notifications" && fk.columnName === "actor_id") ||
    (fk.tableName === "books" && fk.columnName === "created_by_user_id")
  );
}

function serializeQueryRows(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

async function checkRowCountsAndAutoIncrement(
  expectations: TableExpectation[],
  db: VerificationDb
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];

  for (const table of expectations.filter((e) => !isSpecialTable(e.tableName))) {
    const actualRowCount = await db.countRows(table.tableName);
    checks.push({
      table: table.tableName,
      check: "rowCount",
      expected: String(table.expectedRowCount),
      actual: String(actualRowCount),
      status: actualRowCount === table.expectedRowCount ? "PASS" : "FAIL",
    });

    if (table.expectedAutoIncrement !== null) {
      const actualAutoIncrement = await db.getAutoIncrement(table.tableName);
      checks.push({
        table: table.tableName,
        check: "autoIncrement",
        expected: String(table.expectedAutoIncrement),
        actual: actualAutoIncrement === null ? "(null)" : String(actualAutoIncrement),
        status: actualAutoIncrement === table.expectedAutoIncrement ? "PASS" : "FAIL",
      });

      const maxId = await db.getMaxId(table.tableName);
      const safe =
        maxId === null || (actualAutoIncrement !== null && actualAutoIncrement > maxId);
      checks.push({
        table: table.tableName,
        check: "autoIncrementSafety",
        expected: "AUTO_INCREMENT > MAX(id)",
        actual: `AUTO_INCREMENT=${actualAutoIncrement ?? "(null)"}, MAX(id)=${maxId ?? "(null)"}`,
        status: safe ? "PASS" : "FAIL",
      });
    }
  }

  return checks;
}

async function checkPrismaMigrations(phase: Phase, db: VerificationDb): Promise<VerificationCheck> {
  const expected = phase === "restored" ? PRODUCTION_MIGRATIONS_COUNT : TOTAL_MIGRATIONS_COUNT;
  const actual = await db.countRows(PRISMA_MIGRATIONS_TABLE);
  return {
    table: PRISMA_MIGRATIONS_TABLE,
    check: "rowCount",
    expected: String(expected),
    actual: String(actual),
    status: actual === expected ? "PASS" : "FAIL",
  };
}

/**
 * `_prisma_migrations`の行数が期待値と一致していても、Prismaはmigration開始時点で
 * 先に行を作成してから実際の適用処理を行うため、途中で失敗したmigrationも
 * レコードとしては残ってしまう。行数だけでなく、全レコードの`finished_at`が
 * 埋まっており`rolled_back_at`が全てNULLであることまで確認し、
 * 「migrationの記録は18件あるが実は一部が未完了・ロールバック済み」という
 * 状態を見逃さないようにする。
 */
async function checkMigrationCompletion(db: VerificationDb): Promise<VerificationCheck> {
  const rows = await db.queryRaw(
    `SELECT migration_name, finished_at, rolled_back_at FROM \`${PRISMA_MIGRATIONS_TABLE}\``
  );

  const incomplete = rows.filter(
    (row) => row.finished_at === null || row.rolled_back_at !== null
  );

  return {
    table: PRISMA_MIGRATIONS_TABLE,
    check: "migrationCompletion",
    expected: "全レコードでfinished_atが設定済み・rolled_back_atがNULL",
    actual: incomplete.length === 0 ? "全件完了" : `${incomplete.length}件が未完了/ロールバック済み`,
    status: incomplete.length === 0 ? "PASS" : "FAIL",
    detail: incomplete.length > 0 ? serializeQueryRows(incomplete) : undefined,
  };
}

async function checkNewEmptyTables(phase: Phase, db: VerificationDb): Promise<VerificationCheck[]> {
  if (phase !== "migrated") return [];

  const checks: VerificationCheck[] = [];
  for (const table of NEW_EMPTY_TABLES) {
    const actual = await db.countRows(table);
    checks.push({
      table,
      check: "rowCount",
      expected: "0",
      actual: String(actual),
      status: actual === 0 ? "PASS" : "FAIL",
      detail: "migrate deploy直後・トラフィック切替前は空であること",
    });
  }
  return checks;
}

async function checkUniqueDuplicates(
  db: VerificationDb,
  constraints: UniqueConstraint[]
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  for (const constraint of constraints) {
    const sql = buildUniqueDuplicateQuery(constraint);
    const duplicates = await db.queryRaw(sql);
    checks.push({
      table: constraint.tableName,
      check: "uniqueDuplicate",
      expected: "0件",
      actual: `${duplicates.length}件`,
      status: duplicates.length === 0 ? "PASS" : "FAIL",
      detail:
        duplicates.length > 0
          ? `重複キー(${constraint.columns.join(", ")}): ${serializeQueryRows(duplicates)}`
          : undefined,
    });
  }
  return checks;
}

async function checkOrphans(
  db: VerificationDb,
  foreignKeys: ForeignKeyDefinition[]
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  for (const fk of foreignKeys) {
    const sql = buildOrphanQuery(fk);
    const orphans = await db.queryRaw(sql);
    checks.push({
      table: fk.tableName,
      check: "orphan",
      expected: "0件",
      actual: `${orphans.length}件`,
      status: orphans.length === 0 ? "PASS" : "FAIL",
      detail:
        orphans.length > 0
          ? `${fk.columnName} -> ${fk.referencedTableName}.${fk.referencedColumnName}: ${serializeQueryRows(orphans)}`
          : undefined,
    });
  }
  return checks;
}

async function checkSourceLive(
  expectations: TableExpectation[],
  targetDb: VerificationDb,
  sourceDb: VerificationDb
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  for (const table of expectations.filter((e) => !isSpecialTable(e.tableName))) {
    const sourceCount = await sourceDb.countRows(table.tableName);
    const targetCount = await targetDb.countRows(table.tableName);
    checks.push({
      table: table.tableName,
      check: "sourceLiveRowCount",
      expected: `dump=${table.expectedRowCount}, source-live=${sourceCount}`,
      actual: `target=${targetCount}`,
      status:
        sourceCount === table.expectedRowCount && targetCount === table.expectedRowCount
          ? "PASS"
          : "FAIL",
      detail:
        "書き込み凍結中の移行元DB・dump導出値・移行先実測値の三者が一致することを確認する",
    });
  }
  return checks;
}

export interface RunVerificationParams {
  expectations: TableExpectation[];
  db: VerificationDb;
  phase: Phase;
  /** 本番切替（#475）時のみ指定。書き込み凍結中の移行元DBへの直接照会を三者比較に加える。 */
  sourceDb?: VerificationDb;
}

export async function runVerification(params: RunVerificationParams): Promise<VerificationCheck[]> {
  const { expectations, db, phase, sourceDb } = params;
  const uniqueConstraints =
    phase === "migrated"
      ? UNIQUE_CONSTRAINTS
      : UNIQUE_CONSTRAINTS.filter(
          (constraint) => !isPendingMigrationUniqueConstraint(constraint)
        );
  const foreignKeys =
    phase === "migrated"
      ? FOREIGN_KEYS
      : FOREIGN_KEYS.filter((fk) => !isPendingMigrationForeignKey(fk));

  const checks: VerificationCheck[] = [];
  checks.push(...(await checkRowCountsAndAutoIncrement(expectations, db)));
  checks.push(await checkPrismaMigrations(phase, db));
  checks.push(await checkMigrationCompletion(db));
  checks.push(...(await checkNewEmptyTables(phase, db)));
  checks.push(...(await checkUniqueDuplicates(db, uniqueConstraints)));
  checks.push(...(await checkOrphans(db, foreignKeys)));

  if (sourceDb) {
    checks.push(...(await checkSourceLive(expectations, db, sourceDb)));
  }

  return checks;
}
