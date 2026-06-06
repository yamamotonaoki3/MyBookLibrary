import { prisma } from "@/lib/prisma";

const TEMP_USER_ID = 1;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ authorId: string }> }
) {
  try {
    const { authorId: authorIdParam } = await params;
    const authorId = Number(authorIdParam);

    if (!authorId || isNaN(authorId)) {
      return Response.json({ error: "Invalid authorId" }, { status: 400 });
    }

    await prisma.favoriteAuthor.delete({
      where: {
        userId_authorId: { userId: TEMP_USER_ID, authorId },
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/favorite-authors/[authorId]]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
