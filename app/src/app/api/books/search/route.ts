import { NextRequest, NextResponse } from "next/server";
import { searchBooks } from "@/lib/rakuten";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type");

  if (!q) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }
  if (type !== "title" && type !== "author") {
    return NextResponse.json({ error: "type は title または author を指定してください" }, { status: 400 });
  }

  try {
    const items = await searchBooks(type === "title" ? { title: q } : { author: q });
    return NextResponse.json({ items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 500 });
  }
}
