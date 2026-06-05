import { NextRequest, NextResponse } from "next/server";
import { searchBooks } from "@/lib/rakuten";

export type SearchResult = {
  title: string;
  author: string;
  isbn: string;
  publisherName: string;
  salesDate: string;
  coverImageUrl: string | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type");

  if (!q) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }
  if (type !== "title" && type !== "author") {
    return NextResponse.json(
      { error: "type は title または author を指定してください" },
      { status: 400 }
    );
  }

  try {
    const params = type === "title" ? { title: q } : { author: q };
    const items = await searchBooks(params);

    const results: SearchResult[] = items.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      publisherName: b.publisherName,
      salesDate: b.salesDate,
      coverImageUrl: b.largeImageUrl || null,
    }));

    return NextResponse.json({ items: results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
