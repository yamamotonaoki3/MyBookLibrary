import { NextRequest, NextResponse } from "next/server";
import { demoForbidden, isDemoMode } from "@/lib/demoMode";
import { tickEnrichment } from "@/lib/bookEnrichmentService";
import { logger } from "@/lib/logger";

const MIN_TICK_SECRET_LENGTH = 16;

export async function GET(req: NextRequest) {
  if (isDemoMode()) return demoForbidden();
  const tickSecret = process.env.ENRICHMENT_TICK_SECRET;
  if (!tickSecret || tickSecret.length < MIN_TICK_SECRET_LENGTH) {
    logger.error("ENRICHMENT_TICK_SECRET is not configured or too short");
    return NextResponse.json({ error: "Tick secret is not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${tickSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await tickEnrichment());
}
