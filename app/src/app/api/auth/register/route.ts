import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, password, secretWord } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: { email: ["このメールアドレスは既に使用されています"] } },
      { status: 409 }
    );
  }

  const hashed = await bcrypt.hash(password, 12);
  const secretWordHash = secretWord ? await bcrypt.hash(secretWord, 12) : undefined;
  await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      ...(secretWordHash ? { secretWordHash } : {}),
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
