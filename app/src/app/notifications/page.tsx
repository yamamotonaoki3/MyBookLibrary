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
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
  ]);

  const actorIds = [
    ...new Set(
      notifications
        .map((n) => n.actorId)
        .filter((id): id is number => id !== null)
    ),
  ];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const actorNameMap = new Map(actors.map((a) => [a.id, a.name]));

  const serialized = notifications.map((n) => ({
    ...n,
    actorName: n.actorId !== null ? (actorNameMap.get(n.actorId) ?? null) : null,
    createdAt: n.createdAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString() ?? null,
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
