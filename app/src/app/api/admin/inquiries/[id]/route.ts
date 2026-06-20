import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const inquiryId = Number(id);

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !["open", "closed"].includes(status)) {
      return Response.json({ error: "無効なステータスです" }, { status: 400 });
    }

    const inquiry = await prisma.contactInquiry.update({
      where: { id: inquiryId },
      data: { status },
    });

    return Response.json(inquiry);
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const inquiryId = Number(id);

  try {
    await prisma.contactInquiry.delete({ where: { id: inquiryId } });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
