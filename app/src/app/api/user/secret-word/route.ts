import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { SecretWordSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const body = await request.json();
  const parsed = SecretWordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.password) {
    return Response.json(
      { error: "この操作はパスワードでログインしているアカウントのみ利用できます" },
      { status: 422 }
    );
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) {
    return Response.json({ error: "現在のパスワードが正しくありません" }, { status: 401 });
  }

  const secretWordHash = await bcrypt.hash(parsed.data.secretWord, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      secretWordHash,
      secretWordFailCount: 0,
      secretWordLockedUntil: null,
    },
  });

  return Response.json({ ok: true });
}
