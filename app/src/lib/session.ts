import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function mustChangePasswordError(): NextResponse {
  return NextResponse.json({ error: "MUST_CHANGE_PASSWORD" }, { status: 403 });
}

// JWTのmustChangePasswordクレームは、管理者が強制リセットを行った時点では
// 既存セッションに反映されない（次回ログイン・update()まで古いまま）。
// JWTの内容だけを信じるとリセット後も一時パスワードのまま操作を続けられて
// しまうため、認証系ヘルパーではDBの最新値で必ず裏取りする。
export async function getAuthenticatedUserId(options?: {
  allowMustChangePassword?: boolean;
}): Promise<{ userId: number; error: null } | { userId: null; error: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      userId: null,
      error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }

  const userId = Number(session.user.id);

  if (!options?.allowMustChangePassword) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true },
    });
    if (dbUser?.mustChangePassword) {
      return { userId: null, error: mustChangePasswordError() };
    }
  }

  return { userId, error: null };
}

export async function requireAdminSession(): Promise<
  { userId: number; error: null } | { userId: null; error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      userId: null,
      error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }
  // JWTの時点で非adminなら、DBに問い合わせるまでもなく拒否する
  if (session.user.role !== "admin") {
    return {
      userId: null,
      error: NextResponse.json({ error: "権限がありません" }, { status: 403 }),
    };
  }

  // JWTがadminを主張している場合のみ、DBの最新roleで裏取りする（Issue #417）。
  // JWTのroleクレームは降格後もセッション更新まで古いままになりうるため。
  // dbUserがnull（削除済みユーザー）の場合も dbUser?.role が undefined になり
  // 自然に同じ403分岐へ落ちる。
  const userId = Number(session.user.id);
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, mustChangePassword: true },
  });
  if (dbUser?.role !== "admin") {
    return {
      userId: null,
      error: NextResponse.json({ error: "権限がありません" }, { status: 403 }),
    };
  }
  if (dbUser.mustChangePassword) {
    return { userId: null, error: mustChangePasswordError() };
  }

  return { userId, error: null };
}
