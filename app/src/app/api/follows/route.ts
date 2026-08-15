import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const targetUserId = Number(body?.targetUserId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "自分自身はフォローできません。" },
        { status: 400 }
      );
    }

    const [target, me] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
    ]);

    if (!target || !me) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません。" },
        { status: 404 }
      );
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: userId, followingId: targetUserId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "すでにフォローしています。", following: true },
        { status: 409 }
      );
    }

    try {
      await prisma.follow.create({
        data: { followerId: userId, followingId: targetUserId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "すでにフォローしています。", following: true },
          { status: 409 }
        );
      }
      throw error;
    }

    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: "follow",
        content: `${me.name}さんにフォローされました。フォローバックしますか？`,
        actorId: userId,
      },
    });

    const followBack = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: targetUserId, followingId: userId },
      },
    });

    return NextResponse.json(
      { following: true, isMutual: followBack !== null },
      { status: 201 }
    );
  } catch (e) {
    logger.error({ err: e }, "[POST /api/follows]");
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const targetUserId = Number(body?.targetUserId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: userId, followingId: targetUserId },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "フォローしていません。" },
        { status: 404 }
      );
    }

    const followedBack = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: targetUserId, followingId: userId },
      },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.follow.delete({ where: { id: existing.id } });

      if (followedBack) {
        await tx.notification.deleteMany({
          where: {
            type: { in: ["mutual_favorite_author", "mutual_want_to_read"] },
            OR: [
              { userId, actorId: targetUserId },
              { userId: targetUserId, actorId: userId },
            ],
          },
        });
      }
    });

    return NextResponse.json({ following: false });
  } catch (e) {
    logger.error({ err: e }, "[DELETE /api/follows]");
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
