import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const CATEGORIES = ["general", "bug", "feature", "account", "other"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, category, subject, body: msgBody } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "名前は必須です" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "有効なメールアドレスを入力してください" }, { status: 400 });
    }
    if (!category || !CATEGORIES.includes(category)) {
      return Response.json({ error: "カテゴリを選択してください" }, { status: 400 });
    }
    if (!subject || typeof subject !== "string" || subject.trim().length === 0 || subject.length > 100) {
      return Response.json({ error: "件名は1〜100文字で入力してください" }, { status: 400 });
    }
    if (!msgBody || typeof msgBody !== "string" || msgBody.trim().length < 10 || msgBody.length > 2000) {
      return Response.json({ error: "本文は10〜2000文字で入力してください" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id ? Number(session.user.id) : null;

    await prisma.contactInquiry.create({
      data: {
        userId,
        name: name.trim(),
        email: email.trim(),
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
