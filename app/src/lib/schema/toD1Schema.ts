/**
 * MySQL 版の Prisma スキーマ（正）から、D1（SQLite）版のスキーマを作る純粋関数。
 * 生成のしくみは docs/cloudflare-d1-migration-plan.md §4-4 を参照。
 *
 * 変換内容:
 *   - generator: 出力先を `src/generated/prisma-d1` にし、エンジン不要の `engineType = "client"` にする
 *   - datasource: `provider = "sqlite"` にする（D1 では実行時にアダプタが接続するため、url は生成・検証用の値）
 *   - フィールド: MySQL 固有のネイティブ型属性（`@db.Text`、`@db.Date` 等）を取り除く
 * モデル・フィールド・インデックス・リレーションは MySQL 版と完全に同一に保つ（ドリフト検査の対象）。
 */

export const D1_SCHEMA_HEADER = [
  "// このファイルは自動生成です。直接編集しないでください。",
  "// 元: prisma/schema.prisma（MySQL 版が正）。再生成: npm run schema:d1",
  "// 差分の検査: npm run schema:d1:check（CI で実行）",
  "",
].join("\n");

const D1_GENERATOR = `generator client {
  provider   = "prisma-client-js"
  output     = "../../src/generated/prisma-d1"
  engineType = "client"
}

datasource db {
  provider = "sqlite"
  url      = "file:./d1-generate-only.db"
}
`;

/** `generator ...{}` と `datasource ...{}` のブロックを取り除いた、モデル・enum 部分を返す。 */
function stripConfigBlocks(source: string): string {
  return source.replace(/^(generator|datasource)\s+\w+\s*\{[^}]*\}\s*/gm, "");
}

/** 1 行を「コード部分」と「文字列リテラル・コメント部分」に分ける（後者は変換・検査の対象にしない）。 */
function splitCodeSegments(line: string): { text: string; isCode: boolean }[] {
  const segments: { text: string; isCode: boolean }[] = [];
  let current = "";
  let i = 0;
  const flush = (isCode: boolean) => {
    if (current) segments.push({ text: current, isCode });
    current = "";
  };
  while (i < line.length) {
    if (line.startsWith("//", i)) {
      flush(true);
      segments.push({ text: line.slice(i), isCode: false });
      return segments;
    }
    if (line[i] === '"') {
      flush(true);
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
      segments.push({ text: line.slice(i, j + 1), isCode: false });
      i = j + 1;
      continue;
    }
    current += line[i];
    i += 1;
  }
  flush(true);
  return segments;
}

/** 各行のコード部分だけに変換を適用する（文字列リテラルとコメントは変えない）。 */
function mapCode(source: string, transform: (code: string) => string): string {
  return source
    .split("\n")
    .map((line) =>
      splitCodeSegments(line)
        .map((segment) => (segment.isCode ? transform(segment.text) : segment.text))
        .join("")
    )
    .join("\n");
}

/** 文字列リテラルとコメントを除いた、コード部分だけのテキストを返す（検査用）。 */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .map((line) =>
      splitCodeSegments(line)
        .filter((segment) => segment.isCode)
        .map((segment) => segment.text)
        .join("")
    )
    .join("\n");
}

/** `@db.Text`、`@db.VarChar(191)` のような MySQL のネイティブ型属性を取り除く。 */
function stripNativeTypes(source: string): string {
  return mapCode(source, (code) => code.replace(/[ \t]+@db\.\w+(\([^)]*\))?/g, ""));
}

export function toD1Schema(mysqlSchema: string): string {
  const models = stripNativeTypes(stripConfigBlocks(mysqlSchema)).trimStart();
  return `${D1_SCHEMA_HEADER}\n${D1_GENERATOR}\n${models.replace(/\s+$/, "")}\n`;
}

/** D1 では使えない（または意味が変わる）MySQL 固有の記述が残っていないかを検査し、問題の一覧を返す。 */
export function findUnsupportedForD1(mysqlSchema: string): string[] {
  const problems: string[] = [];
  const body = codeOnly(stripNativeTypes(stripConfigBlocks(mysqlSchema)));
  if (/^\s*enum\s+\w+/m.test(body)) problems.push("enum は SQLite（D1）では使えません");
  if (/@@fulltext/.test(body)) problems.push("@@fulltext は SQLite（D1）では使えません");
  if (/\bUnsupported\(/.test(body)) problems.push("Unsupported 型は D1 版へそのまま移せません");
  if (/\b\w+\s+Decimal\b/.test(body)) problems.push("Decimal は SQLite（D1）では精度が変わります");
  if (/\b\w+\s+BigInt\b/.test(body)) problems.push("BigInt は D1 のアダプタで扱いに注意が必要です");
  return problems;
}
