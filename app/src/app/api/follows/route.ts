import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";

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

    await prisma.follow.create({
      data: { followerId: userId, followingId: targetUserId },
    });

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
    console.error("[POST /api/follows]", e);
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

    await prisma.follow.delete({ where: { id: existing.id } });

    return NextResponse.json({ following: false });
  } catch (e) {
    console.error("[DELETE /api/follows]", e);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}
