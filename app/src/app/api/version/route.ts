import { NextResponse } from "next/server";
import { getWorkerVersion } from "@/lib/workerVersion";

// リクエストごとに、いま動いているバージョンを返す（ビルド時に固定されないようにする）。
export const dynamic = "force-dynamic";

/**
 * 稼働中の Worker のバージョンを返す。認証は不要（ロールバックの確認と疎通確認で、ログインなしに使うため）。
 * 返す値は、バージョン ID・タグ（コミット）・時刻のみ。Workers 以外では version が null になる。
 */
export async function GET() {
  return NextResponse.json({ version: getWorkerVersion() }, { headers: { "Cache-Control": "no-store" } });
}
