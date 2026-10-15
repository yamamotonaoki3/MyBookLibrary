/**
 * お気に入り著者の詳細ページ（/favorite-authors/[authorId]）への <Link> は、先読みしない（#732）。
 * 詳細ページは表示のたびに楽天ブックス API を最大 5 ページ分呼ぶため、先読みされると、一覧やホームを表示しただけで
 * 著者の数だけ API が呼ばれ、回数制限（429）になる。リンクを増やしたときの付け忘れも、ここで検知する。
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const SRC_DIR = join(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "generated" ? [] : sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// `=>`（アロー関数）を含む属性があっても、属性の順序によらず、開始タグの終わりまでを 1 つの要素として取る。
// 一覧ページ（/favorite-authors）は対象外で、詳細ページ（/favorite-authors/ の後ろに続くもの）だけを見る
const LINK_TAG = /<Link\b(?:=>|[^>])*>/g;

describe("お気に入り著者の詳細ページへの <Link>（#732）", () => {
  const linkTags = sourceFiles(SRC_DIR).flatMap((file) =>
    (readFileSync(file, "utf8").match(LINK_TAG) ?? [])
      .filter((tag) => tag.includes("favorite-authors/"))
      .map((tag) => ({ file: relative(SRC_DIR, file).split(sep).join("/"), tag }))
  );

  it("リンクが見つかる（検出が空振りしていない）", () => {
    expect(linkTags.length).toBeGreaterThanOrEqual(4);
  });

  it.each(linkTags.map((link, index) => [`${link.file} #${index + 1}`, link.tag]))("%s は prefetch={false}", (_name, tag) => {
    expect(tag).toContain("prefetch={false}");
  });
});
