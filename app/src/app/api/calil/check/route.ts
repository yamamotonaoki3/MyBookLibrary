import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailability } from "@/lib/calil";
import { searchBooksNdl } from "@/lib/ndl";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");
  const title = searchParams.get("title");

  if (!isbn) {
    return NextResponse.json({ error: "isbn は必須です" }, { status: 400 });
  }

  // 図書館取得とNDL検索を並列実行
  const [libraries, ndlResult] = await Promise.all([
    prisma.userLibrary.findMany({
      where: { userId },
      select: { systemid: true, libkey: true, name: true },
    }),
    title
      ? searchBooksNdl({ type: "title", q: title, page: 1 }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (libraries.length === 0) {
    return NextResponse.json({ results: [], message: "近隣図書館が登録されていません" });
  }

  // NDLから同タイトルのISBNを収集（最大5件）
  const ndlIsbns = (ndlResult?.items ?? [])
    .map((b) => b.isbn)
    .filter((v): v is string => v !== null)
    .slice(0, 5);

  // 楽天ISBNとNDL ISBNを結合（重複排除）
  const isbns = [...new Set([isbn, ...ndlIsbns])];

  try {
    const uniqueSystemids = [...new Set(libraries.map((l) => l.systemid))];
    const rawResults = await checkAvailability(isbns, uniqueSystemids);

    // ユーザーが登録した systemid + libkey の組み合わせに絞り込む
    const filtered = rawResults.filter((r) => {
      if (r.loanStatus === "蔵書なし") {
        return libraries.some((l) => l.systemid === r.systemid);
      }
      return libraries.some(
        (l) => l.systemid === r.systemid && (l.libkey === "" || l.libkey === r.libkey)
      );
    });

    // 同じ systemid に「蔵書なし」以外の結果があれば「蔵書なし」を除外
    const systemidsWithStock = new Set(
      filtered.filter((r) => r.loanStatus !== "蔵書なし").map((r) => r.systemid)
    );
    const deduped = filtered.filter(
      (r) => !(r.loanStatus === "蔵書なし" && systemidsWithStock.has(r.systemid))
    );

    // 図書館名を付与
    const enriched = deduped.map((r) => {
      const lib = r.loanStatus === "蔵書なし"
        ? libraries.find((l) => l.systemid === r.systemid)
        : libraries.find((l) => l.systemid === r.systemid && (l.libkey === "" || l.libkey === r.libkey));
      return {
        ...r,
        libname: lib?.name ?? (r.libkey || r.systemid),
      };
    });

    return NextResponse.json({ results: enriched });
  } catch (err) {
    logger.error({ err }, "[GET /api/calil/check]");
    return NextResponse.json(
      { error: "貸出状況の確認に失敗しました" },
      { status: 500 }
    );
  }
}
