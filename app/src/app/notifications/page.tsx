import { prisma } from "@/lib/prisma";
import { NotificationList } from "./_components/NotificationList";

const TEMP_USER_ID = 1;

export default async function NotificationsPage() {
  const notifications = await prisma.notification.findMany({
    where: { userId: TEMP_USER_ID },
    orderBy: { createdAt: "desc" },
  });

  const serialized = notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString() ?? null,
  }));

  return (
    <main className="flex flex-col px-4 py-6 lg:px-8 lg:py-8">
      <NotificationList initialNotifications={serialized} />
    </main>
  );
}
