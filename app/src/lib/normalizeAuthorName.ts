/** 著者名の全角・半角スペースを除去して正規化する */
export function normalizeAuthorName(name: string): string {
  return name.replace(/[\s　]/g, "");
}
