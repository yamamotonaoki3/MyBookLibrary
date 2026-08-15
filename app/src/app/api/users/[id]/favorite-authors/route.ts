import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

const READING_STATUSES = ["reading", "read"] as const;

export async function GET(request: NextRequest, { params }: Props) {
  const { userId: myUserId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { id } = await params;
  const targetUserId = Number(id);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "ユーザーが見つかりません。" }, { status: 404 });
  }

  const isSelf = targetUserId === myUserId;

  const [iFollow, followsMe] = await Promise.all([
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: myUserId, followingId: targetUserId } },
    }),
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: targetUserId, followingId: myUserId } },
    }),
  ]);
  const isMutual = iFollow !== null && followsMe !== null;

  if (!isSelf && !isMutual) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const [favoriteAuthors, readingStatuses] = await Promise.all([
    prisma.favoriteAuthor.findMany({
      where: { userId: targetUserId },
      select: { id: true, author: { select: { name: true } } },
      orderBy: { author: { name: "asc" } },
    }),
    prisma.readingStatus.findMany({
      where: { userId: targetUserId, status: { in: [...READING_STATUSES] } },
      select: {
        id: true,
        status: true,
        book: { select: { id: true, title: true, author: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    name: user.name,
    favoriteAuthors: favoriteAuthors.map((f) => ({ id: f.id, name: f.author.name })),
    readingBooks: readingStatuses.map((rs) => ({
      id: rs.id,
      status: rs.status,
      bookId: rs.book.id,
      title: rs.book.title,
      authorName: rs.book.author.name,
    })),
  });
}
