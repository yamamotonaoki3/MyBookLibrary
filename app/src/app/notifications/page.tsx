import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { NotificationList } from "./_components/NotificationList";

export default async function NotificationsPage() {
  const session = await auth();
  const userId = Number(session!.user.id);

  const [notifications, followingRecords] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
  ]);

  const serialized = notifications.map(({ actor, ...notification }) => ({
    ...notification,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    createdAt: notification.createdAt.toISOString(),
    expiresAt: notification.expiresAt?.toISOString() ?? null,
  }));

  return (
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="flex-1 overflow-y-auto">
        <NotificationList
          initialNotifications={serialized}
          followingIds={followingRecords.map((f) => f.followingId)}
        />
      </div>
    </main>
  );
}
