import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId } from "@/lib/session";
import { logger } from "@/lib/logger";


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ authorId: string }> }
) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const { authorId: authorIdParam } = await params;
    const authorId = Number(authorIdParam);

    if (!authorId || isNaN(authorId)) {
      return Response.json({ error: "Invalid authorId" }, { status: 400 });
    }

    await prisma.favoriteAuthor.delete({
      where: {
        userId_authorId: { userId: userId, authorId },
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "[DELETE /api/favorite-authors/[authorId]]");
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ authorId: string }> }
) {
  try {
    const { userId, error } = await getAuthenticatedUserId();
    if (error) return error;
    const { authorId: authorIdParam } = await params;
    const authorId = Number(authorIdParam);

    if (!authorId || isNaN(authorId)) {
      return NextResponse.json({ error: "Invalid authorId" }, { status: 400 });
    }

    const { notify } = (await request.json()) as { notify: boolean };

    await prisma.favoriteAuthor.update({
      where: { userId_authorId: { userId: userId, authorId } },
      data: { notify },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[PATCH /api/favorite-authors/[authorId]]");
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
