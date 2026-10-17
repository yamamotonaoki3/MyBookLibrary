/**
 * ドキュメントのリンク切れ・パス切れを確認する（#754）。
 *
 *   npm run check:docs          … リポジトリが追跡する Markdown を、すべて確認する
 *
 * 確認すること:
 *   1. 相対リンク `[文字](相対パス)` の、リンク先のファイル・ディレクトリが存在する（URL・`#` だけのリンクは対象外。
 *      `#見出し` のアンカーの存在は、確認しない）
 *   2. バッククォートで囲んだファイルのパス（`app/…`・`docs/…`・`terraform/…`・`src/…`）が存在する。
 *      `src/…` は `app/` からの相対。`app/api/…` のような App Router の表記は、`app/src/` 以下も探す。
 *      git の管理外（`.gitignore` の対象。`.env.*`・`terraform.tfvars`・証明書など、各自が作るファイル）の名前は、存在しなくてよい
 *
 * 存在の判定は、大文字・小文字まで一致するときだけ「ある」とする（Windows・macOS でも、Linux の CI と同じ結果にするため）。
 *
 * 対象外（過去の記録のため）: `docs/archive/` と `docs/lessons-learned.md` は、1 のリンクだけ確認し、2 は確認しない
 * （当時のパスや、すでに無いパスを、そのまま引用していることがある）。コードブロック（``` と ~~~）の中は、確認しない。
 * 「存在しないが、書いてよいパス」は、下の ALLOWED_MISSING_PATHS に、理由つきで足す。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/** 存在しなくても、ドキュメントに書いてよいパス（例: 実行時に作られるもの）。理由を必ず書く。 */
const ALLOWED_MISSING_PATHS = new Map([
  // ["app/example.txt", "実行時に作られるファイル"],
]);

const skipsPathCheck = (file) => file.startsWith("docs/archive/") || file === "docs/lessons-learned.md";

const markdownFiles = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

/**
 * リポジトリの `.gitignore` の対象の名前か（各自が作る、git 管理外のファイル）。
 * 個人のグローバルな除外設定（core.excludesFile）と、ローカル固有の `.git/info/exclude` は、数えない
 * （個人の環境で通る確認が、CI で失敗することを防ぐ）。除外した元のファイルを、`git check-ignore -v` で調べる。
 */
function isGitIgnored(relativePath) {
  try {
    const output = execFileSync("git", ["-c", `core.excludesFile=${path.join(root, ".no-global-excludes")}`, "check-ignore", "-v", "--", relativePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // 出力: `<除外した元のファイル>:<行>:<パターン>\t<パス>`。`!` で始まるパターンは、除外を打ち消す（除外していない）
    const match = /^([^:]+):\d+:([^\t]*)\t/.exec(output);
    return match !== null && path.basename(match[1]) === ".gitignore" && !match[2].startsWith("!");
  } catch {
    return false;
  }
}

/**
 * 大文字・小文字まで一致して存在するか。ファイルシステムが区別しない環境でも、
 * ディレクトリの一覧と突き合わせて、Linux と同じ結果にする（`docs/Requirements.md` を、見逃さない）。
 */
function existsExact(relativePath) {
  let current = root;
  for (const segment of relativePath.split(/[\\/]/).filter(Boolean)) {
    if (!existsSync(current) || !readdirSync(current).includes(segment)) return false;
    current = path.join(current, segment);
  }
  return existsSync(current);
}

const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// 日本語などの文字（\p{L}）も、パスとして扱う
const BACKTICK_PATH = /`((?:app|docs|terraform|src)\/[\p{L}\p{N}_./[\]()@-]*[\p{L}\p{N}_\])])`/gu;

/**
 * コードブロック（``` または ~~~ で囲んだ部分）を空行に置き換える。行番号は保つ。
 * 閉じるのは、開いたのと同じ記号で、開いたときと同じ長さ以上の行（CommonMark の規則）。
 */
function stripFencedCode(text) {
  let fence = null; // { char, length }
  return text
    .split("\n")
    .map((line) => {
      const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence === null) {
        if (match) fence = { char: match[1][0], length: match[1].length };
        return match ? "" : line;
      }
      const closes = match && match[1][0] === fence.char && match[1].length >= fence.length && line.slice(match[0].length).trim() === "";
      if (closes) fence = null;
      return "";
    })
    .join("\n");
}

const problems = [];

for (const file of markdownFiles) {
  const lines = stripFencedCode(readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")).split("\n");
  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;

    for (const match of line.matchAll(LINK)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const clean = decodeURIComponent(target.split("#")[0].split("?")[0]);
      if (!clean) continue;
      const resolved = path.resolve(root, path.dirname(file), clean);
      if (!existsExact(path.relative(root, resolved))) problems.push(`${where}  リンク切れ: ${target}`);
    }

    if (skipsPathCheck(file)) return;
    for (const match of line.matchAll(BACKTICK_PATH)) {
      const written = match[1];
      if (ALLOWED_MISSING_PATHS.has(written)) continue;
      const candidates = written.startsWith("src/") ? [path.join("app", written)] : [written];
      if (written.startsWith("app/")) candidates.push(path.join("app/src", written)); // App Router の表記（app/api/… = app/src/app/api/…）
      if (candidates.some((candidate) => existsExact(candidate) || isGitIgnored(candidate))) continue;
      problems.push(`${where}  存在しないパス: ${written}`);
    }
  });
}

if (problems.length > 0) {
  console.error(`ドキュメントに、リンク切れ・存在しないパスが ${problems.length} 件あります。\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    "\n移動・削除したファイルを参照している場合は、リンクとパスを直してください。意図して存在しないパスを書く場合は、scripts/check-docs.mjs の ALLOWED_MISSING_PATHS に、理由つきで足します。"
  );
  process.exit(1);
}
console.log(`ドキュメントの確認: ${markdownFiles.length} ファイルに、リンク切れ・存在しないパスはありません。`);
