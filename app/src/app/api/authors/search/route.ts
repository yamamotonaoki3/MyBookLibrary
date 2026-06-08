import { prisma } from "@/lib/prisma";
import { normalizeAuthorName } from "@/lib/normalizeAuthorName";
import { searchAuthorsByName } from "@/lib/ndl";
import { searchBooks } from "@/lib/rakuten";

const TEMP_USER_ID = 1;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return Response.json({ error: "q is required" }, { status: 400 });
  }

  try {
    // 楽天APIで著者名検索
    const rakutenBooks = await searchBooks({ author: q, maxPages: 3 });
    let authorNames: string[] = [];

    if (rakutenBooks.length > 0) {
      // 楽天の結果から著者名を正規化・抽出してユニーク化
      const seen = new Set<string>();
      for (const book of rakutenBooks) {
        const name = normalizeAuthorName(book.author);
        if (name && !seen.has(name)) {
          seen.add(name);
          authorNames.push(name);
        }
      }
    } else {
      // 楽天で0件の場合はNDLにフォールバック
      const ndlNames = await searchAuthorsByName(q);
      authorNames = ndlNames.map(normalizeAuthorName).filter(Boolean);
    }

    // お気に入り登録済みの著者名セットを正規化して取得
    const favorites = await prisma.favoriteAuthor.findMany({
      where: { userId: TEMP_USER_ID },
      select: { author: { select: { name: true } } },
    });
    const favoriteNames = new Set(
      favorites.map((f) => normalizeAuthorName(f.author.name))
    );

    const result = authorNames.map((name) => ({
      name,
      isFavorite: favoriteNames.has(name),
    }));

    return Response.json(result);
  } catch (error) {
    console.error("[GET /api/authors/search]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
