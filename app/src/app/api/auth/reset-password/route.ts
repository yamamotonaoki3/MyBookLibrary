import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ResetPasswordSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    step: "check" | "reset";
    email?: string;
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
    return NextResponse.json({ ok: true });
  }

  if (body.step === "reset") {
    const result = ResetPasswordSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { email, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: { password: hashed, loginFailCount: 0, lockedUntil: null },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
}
