import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";
import { queryLibraryAvailability, type AvailabilityTarget } from "@/lib/libraryAvailabilityQuery";

const bookIdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const isbnSchema = z.string().regex(/^(?:[0-9]{13}|[0-9]{9}[0-9Xx])$/);

export async function GET(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  let target: AvailabilityTarget;
  if (searchParams.has("bookId")) {
    const parsed = bookIdSchema.safeParse(searchParams.get("bookId"));
    if (!parsed.success) return NextResponse.json({ error: "bookId が不正です" }, { status: 400 });
    target = { bookId: parsed.data };
  } else {
    const parsed = isbnSchema.safeParse(searchParams.get("isbn"));
    if (!parsed.success) return NextResponse.json({ error: "bookId または ISBN は必須です" }, { status: 400 });
    target = { isbn: parsed.data };
  }
  try {
    const result = await queryLibraryAvailability(userId, target);
    return result === null
      ? NextResponse.json({ error: "本が見つかりません" }, { status: 404 })
      : NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "[GET /api/calil/check-book]");
    return NextResponse.json({ error: "貸出状況の確認に失敗しました" }, { status: 500 });
  }
}
