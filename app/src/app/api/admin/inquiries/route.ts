import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/session";
import { maskEmail } from "@/lib/maskEmail";

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    const inquiries = await prisma.contactInquiry.findMany({
      where: status ? { status } : undefined,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(
      inquiries.map((i) => ({
        ...i,
        email: maskEmail(i.email),
        user: i.user && { ...i.user, email: maskEmail(i.user.email) },
      }))
    );
  } catch {
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
