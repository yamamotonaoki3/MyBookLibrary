import "server-only";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type ReadingStatusValue = "unread" | "want_to_read" | "reading" | "read";

export async function findOrCreateAuthorByName(name: string) {
  const existing = await prisma.author.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.author.create({ data: { name } });
}

export function findBookByIsbn(isbn: string) {
  return prisma.book.findFirst({ where: { isbn } });
}

export function findBookByTitleAndAuthor(title: string, authorId: number) {
  return prisma.book.findFirst({ where: { title, authorId } });
}

/**
 * 本を新規作成する。同時リクエスト等でISBNのUnique制約に抵触した場合は、
 * 既に登録済みのレコードを返す（Prismaのエラーコードに依存する処理のためここに置く）。
 */
export async function createBookOrReuseExisting(
  data: Prisma.BookUncheckedCreateInput,
  isbnForRecovery: string | undefined
) {
  try {
    return await prisma.book.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.book.findFirst({ where: { isbn: isbnForRecovery } });
      if (existing) return existing;
    }
    throw err;
  }
}

export function deleteReadingStatus(userId: number, bookId: number) {
  return prisma.readingStatus.deleteMany({ where: { userId, bookId } });
}

export function findReadingStatusValue(userId: number, bookId: number) {
  return prisma.readingStatus.findUnique({
    where: { userId_bookId: { userId, bookId } },
    select: { status: true },
  });
}

export function upsertReadingStatus(userId: number, bookId: number, status: ReadingStatusValue) {
  return prisma.readingStatus.upsert({
    where: { userId_bookId: { userId, bookId } },
    update: { status },
    create: { userId, bookId, status },
  });
}

export function findUserName(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
}

export function createNotifications(data: Prisma.NotificationCreateManyInput[]) {
  return prisma.notification.createMany({ data });
}
