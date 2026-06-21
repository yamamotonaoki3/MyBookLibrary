import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailability } from "@/lib/calil";
import { getAuthenticatedUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn");

  if (!isbn) {
    return NextResponse.json({ error: "isbn は必須です" }, { status: 400 });
  }

  const libraries = await prisma.userLibrary.findMany({
    where: { userId },
    select: { systemid: true, libkey: true, name: true },
  });

  if (libraries.length === 0) {
    return NextResponse.json({ results: [], message: "近隣図書館が登録されていません" });
  }

  try {
    // 同じ systemid は重複して照会しない
    const uniqueSystemids = [...new Set(libraries.map((l) => l.systemid))];
    const rawResults = await checkAvailability(isbn, uniqueSystemids);

    // ユーザーが登録した systemid + libkey の組み合わせに絞り込む
    // libkey が "" の場合はシステム全体（蔵書なし）を表示
    const filtered = rawResults.filter((r) => {
      if (r.loanStatus === "蔵書なし") {
        // そのシステムを登録しているユーザーなら表示
        return libraries.some((l) => l.systemid === r.systemid);
      }
      return libraries.some(
        (l) => l.systemid === r.systemid && (l.libkey === "" || l.libkey === r.libkey)
      );
    });

    // 図書館名を付与（登録済みの name を使う）
    const enriched = filtered.map((r) => {
      // 「蔵書なし」は libkey が "" で返るため systemid だけで名前を引く
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
    console.error("[GET /api/calil/check]", err);
    return NextResponse.json(
      { error: "貸出状況の確認に失敗しました" },
      { status: 500 }
    );
  }
}
