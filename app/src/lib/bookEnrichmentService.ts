import { Prisma } from "@/generated/prisma";
import {
  findRunningEnrichmentJob,
  findActiveEnrichmentJob,
  findEnrichmentTargets,
  createEnrichmentJob,
  listEnrichmentJobs,
} from "@/repositories/bookEnrichmentRepository";
import { recordAuditEvent, AUDIT_EVENT } from "@/lib/auditLog";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { isCronDrivenEnrichment } from "@/lib/enrichmentMode";
import { logger } from "@/lib/logger";

export async function startEnrichment(userId: number, ipAddress: string | null) {
  try {
    const runningJob = await findRunningEnrichmentJob();
    if (runningJob) return { kind: "conflict" as const, jobId: runningJob.id };
    const targets = await findEnrichmentTargets();
    if (targets.length === 0) return { kind: "empty" as const };
    const job = await createEnrichmentJob(userId, targets);
    await recordAuditEvent({
      eventType: AUDIT_EVENT.ADMIN_BOOK_ENRICHMENT_STARTED,
      actorUserId: userId,
      detail: { jobId: job.id, totalCount: job.totalCount },
      ipAddress,
    });
    if (!isCronDrivenEnrichment()) {
      void processEnrichmentJob(job.id).catch((err) => {
        logger.error({ err, jobId: job.id }, "[book-enrichment/start] worker failed");
      });
    }
    return { kind: "started" as const, jobId: job.id, totalCount: job.totalCount };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const runningJob = await findActiveEnrichmentJob();
      return { kind: "conflict" as const, jobId: runningJob?.id };
    }
    throw error;
  }
}

const TICK_BUDGET_MS = 20_000;
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

export async function tickEnrichment() {
  if (isCronDrivenEnrichment()) {
    const startedAt = Date.now();
    const jobs = await listEnrichmentJobs();
    const processed: number[] = [];
    for (const job of jobs) {
      // クエリと前ジョブの時間も含め、tick全体の予算を共有する。
      const remainingMs = TICK_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs <= 0) break;
      await processEnrichmentJob(job.id, { maxMs: remainingMs });
      processed.push(job.id);
    }
    return { processed };
  }
  const jobs = await listEnrichmentJobs(new Date(Date.now() - STALE_THRESHOLD_MS));
  for (const job of jobs) {
    void processEnrichmentJob(job.id).catch((err) => {
      logger.error({ err, jobId: job.id }, "[book-enrichment/tick] resume failed");
    });
  }
  return { resumed: jobs.map((job) => job.id) };
}
