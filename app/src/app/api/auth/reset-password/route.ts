import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ResetPasswordSchema } from "@/lib/validations";

const SECRET_WORD_LOCK_THRESHOLD = 10;
const SECRET_WORD_LOCK_DURATION_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    step: "check" | "verifySecretWord" | "reset";
    email?: string;
    secretWord?: string;
    password?: string;
    confirmPassword?: string;
  };

  if (body.step === "check") {
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "メールアドレスを入力してください" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!user.password) {
      return NextResponse.json({ error: "GOOGLE_ACCOUNT" }, { status: 422 });
    }
    if (!user.secretWordHash) {
      const existingNotification = await prisma.notification.findFirst({
        where: { userId: user.id, type: "secret_word_required" },
      });
      if (!existingNotification) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "secret_word_required",
            content:
              "パスワードリセットには秘密の言葉の設定が必要です。設定画面から登録してください。",
          },
        });
      }
      return NextResponse.json({ error: "SECRET_WORD_NOT_SET" }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.step === "verifySecretWord" || body.step === "reset") {
    const email = body.email?.trim();
    const secretWord = body.secretWord?.trim();
    if (!email || !secretWord) {
      return NextResponse.json({ error: "秘密の言葉を入力してください" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password || !user.secretWordHash) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (user.secretWordLockedUntil && user.secretWordLockedUntil > new Date()) {
      return NextResponse.json({ error: "SECRET_WORD_LOCKED" }, { status: 423 });
    }

    const valid = await bcrypt.compare(secretWord, user.secretWordHash);
    if (!valid) {
      // ロック期限切れ後は失敗回数をリセットしてから数え直す
      const lockExpired = user.secretWordLockedUntil && user.secretWordLockedUntil <= new Date();
      const baseCount = lockExpired ? 0 : user.secretWordFailCount;
      const newCount = baseCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          secretWordFailCount: newCount,
          secretWordLockedUntil:
            newCount >= SECRET_WORD_LOCK_THRESHOLD
              ? new Date(Date.now() + SECRET_WORD_LOCK_DURATION_MS)
              : null,
        },
      });
      return NextResponse.json({ error: "SECRET_WORD_INVALID" }, { status: 401 });
    }

    if (user.secretWordFailCount > 0 || user.secretWordLockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { secretWordFailCount: 0, secretWordLockedUntil: null },
      });
    }

    if (body.step === "verifySecretWord") {
      return NextResponse.json({ ok: true });
    }

    // step === "reset": stateless運用のためここでも秘密の言葉を再検証してからパスワードを更新する
    const result = ResetPasswordSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const hashed = await bcrypt.hash(result.data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        loginFailCount: 0,
        lockedUntil: null,
        secretWordFailCount: 0,
        secretWordLockedUntil: null,
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
}
