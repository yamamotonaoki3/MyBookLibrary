/**
 * mysqldump（--single-transaction --skip-extended-insert）で取得したdump.sqlを解析し、
 * テーブルごとの行数期待値・AUTO_INCREMENT期待値を抽出する。
 * DB接続やファイルI/Oを行わない純粋関数のみで構成する（呼び出し側でファイルを読み込んで渡す）。
 */

export interface TableExpectation {
  tableName: string;
  expectedRowCount: number;
  /**
   * CREATE TABLE文のAUTO_INCREMENT=<値>テーブルオプション。
   * - AUTO_INCREMENT列を持ち、オプション省略時（=初期値のまま）は 1。
   * - AUTO_INCREMENT列自体を持たないテーブル（accounts/sessions/verification_tokens等）は null。
   */
  expectedAutoIncrement: number | null;
}

const INSERT_INTO_PATTERN = /^INSERT INTO `([^`]+)`/;
const CREATE_TABLE_START_PATTERN = /^CREATE TABLE `([^`]+)`/;
const AUTO_INCREMENT_OPTION_PATTERN = /\bAUTO_INCREMENT=(\d+)\b/;
const AUTO_INCREMENT_COLUMN_PATTERN = /\bAUTO_INCREMENT\b/;

/**
 * dump.sql全文からテーブルごとの期待値を抽出する。
 * CREATE TABLE文は複数行にまたがるため、`CREATE TABLE` 開始行から
 * 行末が `;` で終わる行までを1文として蓄積してから解析する。
 */
export function parseDump(dumpText: string): TableExpectation[] {
  const rowCounts = new Map<string, number>();
  const autoIncrements = new Map<string, number | null>();
  const tableOrder: string[] = [];

  const lines = dumpText.split(/\r\n|\n/);

  let collectingTable: string | null = null;
  let collectedStatement: string[] = [];

  for (const line of lines) {
    if (collectingTable !== null) {
      collectedStatement.push(line);
      if (line.trimEnd().endsWith(";")) {
        finalizeCreateTable(collectingTable, collectedStatement.join("\n"));
        collectingTable = null;
        collectedStatement = [];
      }
      continue;
    }

    const insertMatch = INSERT_INTO_PATTERN.exec(line);
    if (insertMatch) {
      const tableName = insertMatch[1];
      registerTable(tableName);
      rowCounts.set(tableName, (rowCounts.get(tableName) ?? 0) + 1);
      continue;
    }

    const createMatch = CREATE_TABLE_START_PATTERN.exec(line);
    if (createMatch) {
      collectingTable = createMatch[1];
      collectedStatement = [line];
      if (line.trimEnd().endsWith(";")) {
        finalizeCreateTable(collectingTable, collectedStatement.join("\n"));
        collectingTable = null;
        collectedStatement = [];
      }
    }
  }

  function registerTable(tableName: string): void {
    if (!tableOrder.includes(tableName)) {
      tableOrder.push(tableName);
    }
  }

  function finalizeCreateTable(tableName: string, statement: string): void {
    registerTable(tableName);

    const optionMatch = AUTO_INCREMENT_OPTION_PATTERN.exec(statement);
    if (optionMatch) {
      autoIncrements.set(tableName, Number(optionMatch[1]));
      return;
    }

    // AUTO_INCREMENT テーブルオプションが無い場合、列定義自体に
    // AUTO_INCREMENT 属性があるかどうかで「初期値1」か「対象外(null)」を分ける。
    if (AUTO_INCREMENT_COLUMN_PATTERN.test(statement)) {
      autoIncrements.set(tableName, 1);
    } else {
      autoIncrements.set(tableName, null);
    }
  }

  return tableOrder.map((tableName) => ({
    tableName,
    expectedRowCount: rowCounts.get(tableName) ?? 0,
    expectedAutoIncrement: autoIncrements.get(tableName) ?? null,
  }));
}
