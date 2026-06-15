import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

type Props = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const entryId = Number(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const entry = await prisma.awardEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      return NextResponse.json({ error: "受賞登録が見つかりません。" }, { status: 404 });
    }

    await prisma.awardEntry.delete({ where: { id: entryId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/admin/award-entries/[id]]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const entryId = Number(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "ID が不正です。" }, { status: 400 });
    }

    const { type } = await request.json();

    if (type !== "winner" && type !== "nominee") {
      return NextResponse.json(
        { error: "type は winner または nominee を指定してください。" },
        { status: 400 }
      );
    }

    const entry = await prisma.awardEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      return NextResponse.json({ error: "受賞登録が見つかりません。" }, { status: 404 });
    }

    const updated = await prisma.awardEntry.update({
      where: { id: entryId },
      data: { type },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/admin/award-entries/[id]]", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
