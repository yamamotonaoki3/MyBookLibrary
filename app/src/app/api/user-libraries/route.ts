import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";

const MAX_LIBRARIES = 5;

export async function GET() {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const libraries = await prisma.userLibrary.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(libraries);
}

export async function POST(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { systemid, libkey, name, pref, city } = await request.json();

  if (!systemid || !name || !pref) {
    return NextResponse.json(
      { error: "systemid, name, pref は必須です" },
      { status: 400 }
    );
  }

  const count = await prisma.userLibrary.count({ where: { userId } });
  if (count >= MAX_LIBRARIES) {
    return NextResponse.json(
      { error: `登録できる図書館は最大${MAX_LIBRARIES}館です` },
      { status: 400 }
    );
  }

  try {
    const library = await prisma.userLibrary.create({
      data: { userId, systemid, libkey: libkey ?? "", name, pref, city: city ?? null },
    });
    return NextResponse.json(library, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "この図書館はすでに登録されています" },
      { status: 409 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, error } = await getAuthenticatedUserId();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const systemid = searchParams.get("systemid");
  const libkey = searchParams.get("libkey") ?? "";

  if (!systemid) {
    return NextResponse.json({ error: "systemid が必要です" }, { status: 400 });
  }

  await prisma.userLibrary.deleteMany({ where: { userId, systemid, libkey } });

  return new NextResponse(null, { status: 204 });
}
