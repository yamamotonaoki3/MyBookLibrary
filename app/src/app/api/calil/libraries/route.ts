import { NextRequest, NextResponse } from "next/server";
import { searchLibraries } from "@/lib/calil";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { error } = await getAuthenticatedUserId();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const pref = searchParams.get("pref");
  const city = searchParams.get("city") ?? undefined;

  if (!pref) {
    return NextResponse.json({ error: "pref は必須です" }, { status: 400 });
  }

  try {
    const libraries = await searchLibraries(pref, city);
    return NextResponse.json(libraries);
  } catch (err) {
    logger.error({ err }, "[GET /api/calil/libraries]");
    return NextResponse.json(
      { error: "図書館の検索に失敗しました" },
      { status: 500 }
    );
  }
}
