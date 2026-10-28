import { prisma } from "@/lib/prisma";

const ACTIVE_JOB_SLOT = "book-enrichment";

export function updateEnrichmentHeartbeat(jobId: number) {
  return prisma.bookEnrichmentJob.update({
    where: { id: jobId },
    data: { lastTickAt: new Date() },
  });
}
export function findRunningEnrichmentJob() {
  return prisma.bookEnrichmentJob.findFirst({ where: { status: "running" } });
}
export function findActiveEnrichmentJob() {
  return prisma.bookEnrichmentJob.findFirst({ where: { activeSlot: ACTIVE_JOB_SLOT } });
}
export function listEnrichmentJobs(staleBefore?: Date) {
  return prisma.bookEnrichmentJob.findMany({ where: {
    status: "running",
    ...(staleBefore ? { lastTickAt: { lt: staleBefore } } : {}),
  } });
}
export function findEnrichmentTargets() {
  return prisma.book.findMany({
    where: {
      OR: [
        { isbn: null },
        { coverImageUrl: null },
        { publishedAtUnknown: true },
        // ISBN・書影・出版年が揃っていても、他版ISBNが未収集の本は対象にする。
        { bookIsbns: { none: {} } },
      ],
    },
    select: { id: true },
  });
}
export function createEnrichmentJob(userId: number, targets: { id: number }[]) {
  const startedAt = new Date();
  return prisma.bookEnrichmentJob.create({
    data: {
      status: "running",
      activeSlot: ACTIVE_JOB_SLOT,
      totalCount: targets.length,
      startedByUserId: userId,
      startedAt,
      lastTickAt: startedAt,
      items: {
        createMany: { data: targets.map((t) => ({ bookId: t.id })) },
      },
    },
  });
}
