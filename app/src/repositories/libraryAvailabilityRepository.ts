import { prisma } from "@/lib/prisma";
import type { AvailabilityTarget } from "@/lib/libraryAvailabilityQuery";

const include = { bookIsbns: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] } };

export function findAvailabilityBook(target: AvailabilityTarget) {
  if ("bookId" in target) return prisma.book.findUnique({ where: { id: target.bookId }, include });
  return prisma.book.findFirst({
    where: { OR: [{ isbn: target.isbn }, { bookIsbns: { some: { isbn: target.isbn } } }] },
    include,
  });
}

export function findAvailabilityLibraries(userId: number) {
  return prisma.userLibrary.findMany({
    where: { userId }, select: { systemid: true, libkey: true, name: true },
  });
}
