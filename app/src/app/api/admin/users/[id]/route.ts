import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { recordAuditEvent, getClientIp, AUDIT_EVENT } from "@/lib/auditLog";
import { MAX_ADMIN_COUNT } from "@/lib/adminLimits";
import { demoteAdminUnlessLast, promoteToAdminUnderLimit } from "@/repositories/userRoleRepository";
import { NextRequest, NextResponse } from "next/server";

class ConcurrentAdminPromotionError extends Error {}

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
      await tx.notification.deleteMany({
        where: {
          OR: [
            { userId: targetId },
            {
              actorId: targetId,
              type: { in: ["mutual_favorite_author", "mutual_want_to_read"] },
            },
          ],
        },
      });
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

  // 管理者数の判定と更新は、競合しないよう 1 つの条件付き UPDATE で原子的に行う
  // （最後の管理者の降格防止・管理者数の上限。詳細は userRoleRepository）。
  if (target.role === "admin" && role === "user") {
    const demoted = await demoteAdminUnlessLast(targetId);
    if (!demoted) {
      return NextResponse.json(
        { error: "最後の管理者を降格することはできません" },
        { status: 400 }
      );
    }
  } else if (target.role === "user" && role === "admin") {
    const promoted = await promoteToAdminUnderLimit(targetId, MAX_ADMIN_COUNT);
    if (!promoted) {
      return NextResponse.json(
        { error: `管理者は最大${MAX_ADMIN_COUNT}人までです` },
        { status: 400 }
      );
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
