import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { auth } from "@/auth";

const CATEGORIES = ["general", "bug", "feature", "account", "other"];

export async function POST(req: Request) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const session = await auth();
  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  try {
    const body = await req.json();
    const { category, subject, body: msgBody } = body;

    if (!category || !CATEGORIES.includes(category)) {
      return Response.json({ error: "カテゴリを選択してください" }, { status: 400 });
    }
    if (!subject || typeof subject !== "string" || subject.trim().length === 0 || subject.length > 100) {
      return Response.json({ error: "件名は1〜100文字で入力してください" }, { status: 400 });
    }
    if (!msgBody || typeof msgBody !== "string" || msgBody.trim().length < 10 || msgBody.length > 2000) {
      return Response.json({ error: "本文は10〜2000文字で入力してください" }, { status: 400 });
    }

    await prisma.contactInquiry.create({
      data: {
        userId,
        name,
        email,
        category,
        subject: subject.trim(),
        body: msgBody.trim(),
      },
    });

    return Response.json({ message: "お問い合わせを受け付けました" }, { status: 201 });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
