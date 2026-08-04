import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { MAX_ADMIN_COUNT } from "@/lib/adminLimits";
import { NextRequest, NextResponse } from "next/server";

class LastAdminDemotionError extends Error {}
class ConcurrentAdminPromotionError extends Error {}
class MaxAdminCountExceededError extends Error {}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const targetId = Number(id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }

  if (userId === targetId) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, email: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 404 }
    );
  }

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "管理者アカウントは削除できません" },
      { status: 400 }
    );
  }

  // 事前チェック（41-46行目）と削除実行の間に、別リクエストがこのユーザーを
  // 管理者へ昇格させると、管理者アカウントが削除されてしまう恐れがある。
  // そのため削除自体にも role: "user" 条件を課し、実行時点でも再確認する。
  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.deleteMany({ where: { userId: targetId } });
      await tx.notification.deleteMany({ where: { userId: targetId } });
      await tx.like.deleteMany({ where: { userId: targetId } });
      await tx.review.deleteMany({ where: { userId: targetId } });
      await tx.readingStatus.deleteMany({ where: { userId: targetId } });
      await tx.favoriteAuthor.deleteMany({ where: { userId: targetId } });
      await tx.session.deleteMany({ where: { userId: targetId } });
      await tx.account.deleteMany({ where: { userId: targetId } });
      const { count } = await tx.user.deleteMany({
        where: { id: targetId, role: "user" },
      });
      if (count === 0) {
        throw new ConcurrentAdminPromotionError();
      }
    });
  } catch (e) {
    if (e instanceof ConcurrentAdminPromotionError) {
      return NextResponse.json(
        { error: "管理者アカウントは削除できません" },
        { status: 400 }
      );
    }
    throw e;
  }

  await recordAuditEvent({
    eventType: AUDIT_EVENT.ADMIN_USER_DELETED,
    actorUserId: userId,
    targetType: "User",
    targetId,
    detail: { deletedUserEmail: target.email },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ message: "ユーザーを削除しました" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const targetId = Number(id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "無効なユーザーIDです" }, { status: 400 });
  }

  if (userId === targetId) {
    return NextResponse.json(
      { error: "自分自身の権限は変更できません" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const role = body?.role;
  if (role !== "admin" && role !== "user") {
    return NextResponse.json(
      { error: "role は admin または user を指定してください" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, email: true },
  });

  if (!target) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 404 }
    );
  }

  if (target.role === role) {
    return NextResponse.json(
      { error: `既に ${role === "admin" ? "管理者" : "一般ユーザー"} です` },
      { status: 400 }
    );
  }

  // システムから管理者が消えてしまう降格を防ぐ。カウントと更新の間に別の
  // 降格リクエストが割り込むと最後の管理者が消えうるため、SELECT ... FOR UPDATE
  // で管理者行をロックしたトランザクション内でカウント・更新を原子的に行う。
  if (target.role === "admin" && role === "user") {
    try {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ count: number | bigint | string }[]>`
          SELECT COUNT(*) as count FROM users WHERE role = 'admin' FOR UPDATE
        `;
        const adminCount = Number(rows[0].count);
        if (adminCount <= 1) {
          throw new LastAdminDemotionError();
        }
        await tx.user.update({ where: { id: targetId }, data: { role } });
      });
    } catch (e) {
      if (e instanceof LastAdminDemotionError) {
        return NextResponse.json(
          { error: "最後の管理者を降格することはできません" },
          { status: 400 }
        );
      }
      throw e;
    }
  } else if (target.role === "user" && role === "admin") {
    // 管理者数の上限を超えないようにする。カウントと更新の間に別の昇格
    // リクエストが割り込むと上限を超えうるため、降格時と同様に
    // SELECT ... FOR UPDATE で管理者行をロックしたトランザクション内で
    // カウント・更新を原子的に行う。
    try {
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ count: number | bigint | string }[]>`
          SELECT COUNT(*) as count FROM users WHERE role = 'admin' FOR UPDATE
        `;
        const adminCount = Number(rows[0].count);
        if (adminCount >= MAX_ADMIN_COUNT) {
          throw new MaxAdminCountExceededError();
        }
        await tx.user.update({ where: { id: targetId }, data: { role } });
      });
    } catch (e) {
      if (e instanceof MaxAdminCountExceededError) {
        return NextResponse.json(
          { error: `管理者は最大${MAX_ADMIN_COUNT}人までです` },
          { status: 400 }
        );
      }
      throw e;
    }
  } else {
    await prisma.user.update({ where: { id: targetId }, data: { role } });
  }

  await recordAuditEvent({
    eventType: AUDIT_EVENT.ADMIN_USER_ROLE_CHANGED,
    actorUserId: userId,
    targetType: "User",
    targetId,
    detail: { from: target.role, to: role, targetEmail: target.email },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ message: "ロールを変更しました", role });
}
