import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { logger } from "@/lib/logger";

const MIN_TICK_SECRET_LENGTH = 16;
// この時間、進捗が更新されていない running ジョブは、EC2再起動等でワーカーが
// 消失したとみなして再開する。
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

export async function GET(req: NextRequest) {
  const tickSecret = process.env.ENRICHMENT_TICK_SECRET;
  if (!tickSecret || tickSecret.length < MIN_TICK_SECRET_LENGTH) {
    logger.error("ENRICHMENT_TICK_SECRET is not configured or too short");
    return NextResponse.json({ error: "Tick secret is not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${tickSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleJobs = await prisma.bookEnrichmentJob.findMany({
    where: {
      status: "running",
      lastTickAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
  });

  for (const job of staleJobs) {
    void processEnrichmentJob(job.id).catch((err) => {
      logger.error({ err, jobId: job.id }, "[GET /api/admin/book-enrichment/tick] resume failed");
    });
  }

  return NextResponse.json({ resumed: staleJobs.map((j) => j.id) });
}
