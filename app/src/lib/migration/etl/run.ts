/**
 * MySQL → D1 のデータ移行（ETL）と照合の本体（docs/archive/cloudflare-d1-migration-plan.md §7）。
 * DB には、Prisma のモデル操作（`findMany` / `createMany` など）の最小限のインターフェース越しにつなぐため、
 * 読み出し元を差し替えられる（MySQL、テスト用のデータ）。
 */
import { applyTransform, MIGRATION_TABLES, type Row, type TableSpec } from "./tables";
import { canonicalize, combineDigests, sha256 } from "./canonical";
import { safeErrorMessage } from "./guard";

export interface Delegate {
  findMany(args: { orderBy: Record<string, "asc">[]; skip: number; take: number }): Promise<Row[]>;
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
  count(): Promise<number>;
  deleteMany(): Promise<{ count: number }>;
}

/** Prisma クライアント相当。モデル名 → Delegate と、生 SQL の実行。 */
export type MigrationClient = Record<string, Delegate> & { $queryRawUnsafe(sql: string): Promise<Row[]> };

export type MigrateOptions = {
  /** 移行する表。既定は全テーブル。デモ用のプロファイル（#719）はマスターデータだけ。 */
  tables?: TableSpec[];
  /** 1 回の読み出し・書き込みの行数。D1 の 1 文あたりのサイズ上限（100 KB）に収めるため、既定は小さめ。 */
  pageSize?: number;
  /** Json 列の DB の NULL を表す値（書き込み先の Prisma の `Prisma.DbNull`）。 */
  dbNull?: unknown;
  onProgress?: (message: string) => void;
};

export type TableSummary = { table: string; source: number; written: number };

const DEFAULT_PAGE_SIZE = 50;

async function* readPages(delegate: Delegate, orderBy: string[], pageSize: number): AsyncGenerator<Row[]> {
  for (let skip = 0; ; skip += pageSize) {
    const rows = await delegate.findMany({ orderBy: orderBy.map((key) => ({ [key]: "asc" as const })), skip, take: pageSize });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < pageSize) return;
  }
}

function toWriteRow(spec: TableSpec, row: Row, dbNull: unknown): Row {
  const converted = applyTransform(spec, row);
  if (!spec.jsonColumns) return converted;
  const result = { ...converted };
  for (const column of spec.jsonColumns) {
    if (result[column] === null && dbNull !== undefined) result[column] = dbNull;
  }
  return result;
}

/** 移行元の users に、小文字化・空白除去したメールアドレスの重複がないことを確認する（あれば移行前に人手で解消する）。 */
export async function assertNoEmailCollisions(source: MigrationClient, pageSize = DEFAULT_PAGE_SIZE): Promise<void> {
  const spec = MIGRATION_TABLES.find((table) => table.model === "user")!;
  const seen = new Set<string>();
  let collisions = 0;
  for await (const rows of readPages(source[spec.model], spec.orderBy, pageSize)) {
    for (const row of rows) {
      const email = String(applyTransform(spec, row).email);
      if (seen.has(email)) collisions += 1;
      seen.add(email);
    }
  }
  if (collisions > 0) {
    throw new Error(`メールアドレスを小文字化すると重複する行が ${collisions} 件あります。移行前に人手で解消してください。`);
  }
}

/** Json 列の（DB 上の列名）。MySQL の `JSON_TYPE` で、JSON の null（SQL の NULL とは別の値）がないことを確認する。 */
const JSON_COLUMNS = [
  { table: "audit_logs", column: "detail" },
  { table: "book_enrichment_items", column: "result_detail" },
];

/**
 * 移行元の Json 列に、JSON の `null`（SQL の NULL とは別の値）がないことを確認する。
 * Prisma は、どちらも JavaScript の `null` として読み出すため、区別できず、移行すると SQL の NULL になる。
 * あれば、移行前に人手で扱いを決める。
 */
export async function assertNoJsonNullValues(source: MigrationClient): Promise<void> {
  for (const { table, column } of JSON_COLUMNS) {
    const rows = await source.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE JSON_TYPE(\`${column}\`) = 'NULL'`);
    const count = Number(rows[0]?.n ?? 0);
    if (count > 0) throw new Error(`${table}.${column} に、JSON の null の値が ${count} 件あります（SQL の NULL に変わってしまうため、移行前に扱いを決めてください）。`);
  }
}

/** 書き込み先の全テーブルが空であることを確認する（既存のデータに上書き・重複して投入しないため）。 */
export async function assertTargetEmpty(target: MigrationClient, tables: TableSpec[] = MIGRATION_TABLES): Promise<void> {
  const nonEmpty: string[] = [];
  for (const spec of tables) {
    if ((await target[spec.model].count()) > 0) nonEmpty.push(spec.table);
  }
  if (nonEmpty.length > 0) {
    throw new Error(`書き込み先が空ではありません（${nonEmpty.join(", ")}）。リハーサルのやり直しは、--reset で先に空にしてください。`);
  }
}

/** 書き込み先の全テーブルを、外部キーの子 → 親の順に空にする（リハーサルのやり直し用）。 */
export async function resetTarget(target: MigrationClient): Promise<void> {
  for (const spec of [...MIGRATION_TABLES].reverse()) await target[spec.model].deleteMany();
}

function hasModel(tables: TableSpec[], model: string): boolean {
  return tables.some((spec) => spec.model === model);
}

function hasJsonTables(tables: TableSpec[]): boolean {
  return hasModel(tables, "auditLog") || hasModel(tables, "bookEnrichmentItem");
}

export async function migrate(source: MigrationClient, target: MigrationClient, options: MigrateOptions = {}): Promise<TableSummary[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const log = options.onProgress ?? (() => {});

  const tables = options.tables ?? MIGRATION_TABLES;
  await assertTargetEmpty(target, tables);
  // 該当の表を移行するときだけ確認する（メールは users、JSON の null は audit_logs と book_enrichment_items）
  if (hasModel(tables, "user")) await assertNoEmailCollisions(source, pageSize);
  if (hasJsonTables(tables)) await assertNoJsonNullValues(source);

  const summaries: TableSummary[] = [];
  for (const spec of tables) {
    const sourceCount = await source[spec.model].count();
    let written = 0;
    for await (const rows of readPages(source[spec.model], spec.orderBy, pageSize)) {
      try {
        const result = await target[spec.model].createMany({ data: rows.map((row) => toWriteRow(spec, row, options.dbNull)) });
        written += result.count;
      } catch (error) {
        // 書き込もうとした値（個人情報）を含み得るため、エラーの内容は、安全な範囲だけを示す
        throw new Error(`${spec.table}: 書き込みに失敗しました（${safeErrorMessage(error)}）`);
      }
    }
    if (written !== sourceCount) {
      throw new Error(`${spec.table}: 移行元 ${sourceCount} 件に対し、書き込みは ${written} 件でした。中断します。`);
    }
    summaries.push({ table: spec.table, source: sourceCount, written });
    log(`${spec.table}: ${written} 件`);
  }
  return summaries;
}

// ---- 照合 ----

export type VerificationCheck = { table: string; check: string; status: "PASS" | "FAIL"; detail?: string };

type Digested = { rows: number; duplicateKeys: number; keys: Set<string>; columns: Map<string, Map<string, string>> };

/** 表の全行を読み、キーの集合と、列ごとの（キー → 値のダイジェスト）を求める。 */
async function digestTable(client: MigrationClient, spec: TableSpec, pageSize: number, transform: boolean): Promise<Digested> {
  const keys = new Set<string>();
  const columns = new Map<string, Map<string, string>>();
  let rowCount = 0;
  let duplicateKeys = 0;
  for await (const rows of readPages(client[spec.model], spec.orderBy, pageSize)) {
    for (const original of rows) {
      const row = transform ? applyTransform(spec, original) : original;
      // 複合キーは、区切り文字の衝突を避けるため、配列として符号化する
      const key = JSON.stringify(spec.orderBy.map((column) => canonicalize(row[column])));
      rowCount += 1;
      if (keys.has(key)) duplicateKeys += 1;
      keys.add(key);
      for (const [column, value] of Object.entries(row)) {
        let digests = columns.get(column);
        if (!digests) columns.set(column, (digests = new Map()));
        digests.set(key, sha256(canonicalize(value)));
      }
    }
  }
  return { rows: rowCount, duplicateKeys, keys, columns };
}

/**
 * 移行元（変換後の値）と書き込み先を、表ごとに照合する。件数、キーの集合（欠落・余剰）、列ごとのハッシュ。
 * 結果には、値そのものを含めない（表名・列名・件数だけ）。
 */
export async function verifyTables(source: MigrationClient, target: MigrationClient, pageSize = DEFAULT_PAGE_SIZE, tables: TableSpec[] = MIGRATION_TABLES): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  for (const spec of tables) {
    const expected = await digestTable(source, spec, pageSize, true);
    const actual = await digestTable(target, spec, pageSize, false);

    checks.push({
      table: spec.table,
      check: "件数",
      status: expected.rows === actual.rows ? "PASS" : "FAIL",
      detail: `移行元 ${expected.rows} / 移行先 ${actual.rows}`,
    });
    const duplicates = expected.duplicateKeys + actual.duplicateKeys;
    checks.push({ table: spec.table, check: "キーの重複", status: duplicates === 0 ? "PASS" : "FAIL", detail: `${duplicates} 件` });

    const missing = [...expected.keys].filter((key) => !actual.keys.has(key)).length;
    const extra = [...actual.keys].filter((key) => !expected.keys.has(key)).length;
    checks.push({ table: spec.table, check: "キーの集合", status: missing === 0 && extra === 0 ? "PASS" : "FAIL", detail: `欠落 ${missing} / 余剰 ${extra}` });

    const columnNames = new Set([...expected.columns.keys(), ...actual.columns.keys()]);
    for (const column of [...columnNames].sort()) {
      const left = expected.columns.get(column);
      const right = actual.columns.get(column);
      // 空の表は、どちらも列を持たない（行がないため）。両方とも空なら一致とする
      const same = left !== undefined && right !== undefined && combineDigests(left) === combineDigests(right);
      checks.push({ table: spec.table, check: `列 ${column}`, status: same ? "PASS" : "FAIL" });
    }
  }
  return checks;
}

/** 書き込み先の外部キー違反（参照先のない行）が 0 件であること。 */
export async function verifyForeignKeys(target: MigrationClient): Promise<VerificationCheck> {
  const violations = await target.$queryRawUnsafe("PRAGMA foreign_key_check");
  return { table: "全テーブル", check: "外部キー違反", status: violations.length === 0 ? "PASS" : "FAIL", detail: `${violations.length} 件` };
}

/**
 * 書き込み先の採番（sqlite_sequence）が、各テーブルの最大 ID 以上であること。
 * 満たさないと、移行後の新規登録が、移行した行の ID と衝突する。
 */
export async function verifySequences(target: MigrationClient, tables: TableSpec[] = MIGRATION_TABLES): Promise<VerificationCheck[]> {
  const sequenceRows = await target.$queryRawUnsafe("SELECT name, seq FROM sqlite_sequence");
  const sequences = new Map(sequenceRows.map((row) => [String(row.name), Number(row.seq)]));
  const checks: VerificationCheck[] = [];
  for (const spec of tables) {
    if (spec.orderBy.length !== 1 || spec.orderBy[0] !== "id") continue;
    const total = await target[spec.model].count();
    if (total === 0) continue;
    const last = await target[spec.model].findMany({ orderBy: [{ id: "asc" }], skip: total - 1, take: 1 });
    const maxId = typeof last[0]?.id === "number" ? last[0].id : null;
    if (maxId === null) continue; // 文字列の主キー（採番なし）
    const sequence = sequences.get(spec.table);
    checks.push({
      table: spec.table,
      check: "採番（sqlite_sequence）",
      status: sequence !== undefined && sequence >= maxId ? "PASS" : "FAIL",
      detail: `採番 ${sequence ?? "なし"} / 最大 ID ${maxId}`,
    });
  }
  return checks;
}

/** 移行元の Json 列に JSON の null がないこと（照合だけを単独で実行したときも、SQL の NULL との区別が付かない値を見逃さない）。 */
export async function verifyJsonNulls(source: MigrationClient): Promise<VerificationCheck> {
  try {
    await assertNoJsonNullValues(source);
    return { table: "Json 列", check: "移行元に JSON の null がない", status: "PASS" };
  } catch (error) {
    return { table: "Json 列", check: "移行元に JSON の null がない", status: "FAIL", detail: safeErrorMessage(error) };
  }
}

export async function verifyAll(source: MigrationClient, target: MigrationClient, pageSize = DEFAULT_PAGE_SIZE, tables: TableSpec[] = MIGRATION_TABLES): Promise<VerificationCheck[]> {
  const checks = [...(await verifyTables(source, target, pageSize, tables)), await verifyForeignKeys(target), ...(await verifySequences(target, tables))];
  // JSON の null は、Json 列を持つ表を移行するときだけ確認する
  if (hasJsonTables(tables)) checks.push(await verifyJsonNulls(source));
  return checks;
}
