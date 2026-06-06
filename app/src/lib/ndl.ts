const NDL_API_BASE = "https://ndlsearch.ndl.go.jp/api/opensearch";

export async function searchAuthorsByName(name: string): Promise<string[]> {
  const url = new URL(NDL_API_BASE);
  url.searchParams.set("creator", name);
  url.searchParams.set("cnt", "30");

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error(`NDL API エラー: ${res.status} ${res.statusText}`);
    return [];
  }

  const xml = await res.text();

  // <dc:creator>東野, 圭吾, 1958-</dc:creator> から著者名部分を抽出
  const matches = xml.matchAll(/<dc:creator>([^<]+)<\/dc:creator>/g);
  const authors = new Set<string>();

  for (const match of matches) {
    const raw = match[1].trim();
    // "姓, 名, 生年" 形式を "姓名" に正規化（カンマ区切りの最初の2要素を結合）
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length >= 2 && /^\d{4}/.test(parts[parts.length - 1])) {
      // 末尾が生年の場合は除いて結合
      const nameParts = parts.slice(0, -1);
      authors.add(nameParts.join(" ").replace(/\s+/g, ""));
    } else {
      authors.add(parts.join(" ").replace(/\s+/g, ""));
    }
  }

  return [...authors];
}
