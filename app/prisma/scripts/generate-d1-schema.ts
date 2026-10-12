/**
 * D1（SQLite）版の Prisma スキーマを、MySQL 版（prisma/schema.prisma）から生成する。
 *
 *   npm run schema:d1         … prisma/d1/schema.prisma を生成（上書き）
 *   npm run schema:d1:check   … 生成結果が現在のファイルと一致するか検査（不一致なら終了コード 1。CI で実行）
 *
 * D1 版は直接編集しない。スキーマを変えるときは MySQL 版を編集して再生成する。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { findUnsupportedForD1, toD1Schema } from "../../src/lib/schema/toD1Schema";

const SOURCE = path.resolve(__dirname, "../schema.prisma");
const TARGET = path.resolve(__dirname, "../d1/schema.prisma");

function main(): void {
  const check = process.argv.includes("--check");
  const source = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");

  const problems = findUnsupportedForD1(source);
  if (problems.length > 0) {
    console.error("D1 版へ変換できない記述があります:\n- " + problems.join("\n- "));
    process.exitCode = 1;
    return;
  }

  const generated = toD1Schema(source);

  if (check) {
    const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== generated) {
      console.error(
        "prisma/d1/schema.prisma が MySQL 版（prisma/schema.prisma）から生成した内容と一致しません。\n" +
          "MySQL 版を変更した場合は `npm run schema:d1` で再生成してコミットしてください（D1 版を直接編集した場合は元に戻してください）。"
      );
      process.exitCode = 1;
      return;
    }
    console.log("D1 版スキーマは MySQL 版と一致しています。");
    return;
  }

  mkdirSync(path.dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, generated, "utf8");
  console.log(`生成しました: ${path.relative(process.cwd(), TARGET)}`);
}

main();
