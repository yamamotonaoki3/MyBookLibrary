import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import FollowButton from "@/app/_components/FollowButton";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return { title: "Not Found" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return {
    title: user ? `${user.name}さんのプロフィール | MyBookLibrary` : "Not Found",
  };
}

export default async function UserProfilePage({ params }: Props) {
  const session = await auth();
  const myUserId = Number(session!.user.id);
  const { id } = await params;
  const targetUserId = Number(id);

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) notFound();

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true },
  });

  if (!user) notFound();

  const isSelf = targetUserId === myUserId;

  const [iFollow, followsMe] = await Promise.all([
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: myUserId,
          followingId: targetUserId,
        },
      },
    }),
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: myUserId,
        },
      },
    }),
  ]);

  const isMutual = iFollow !== null && followsMe !== null;

  const [favoriteAuthors, readingStatuses] = await Promise.all([
    prisma.favoriteAuthor.findMany({
      where: { userId: targetUserId },
      select: { id: true, author: { select: { name: true } } },
      orderBy: { author: { name: "asc" } },
    }),
    prisma.readingStatus.findMany({
      where: {
        userId: targetUserId,
        status: { in: ["want_to_read", "reading", "read"] },
      },
      select: {
        id: true,
        status: true,
        book: {
          select: {
            id: true,
            title: true,
            author: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="flex-1 overflow-y-auto">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {user.name}さんのプロフィール
          </h1>
          {!isSelf && (
            <FollowButton
              targetUserId={user.id}
              targetUserName={user.name}
              initialFollowing={iFollow !== null}
            />
          )}
          {isMutual && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              相互フォロー
            </span>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              お気に入り著者
            </h2>
            {favoriteAuthors.length === 0 ? (
              <p className="text-sm text-zinc-500">
                お気に入り著者はまだ登録されていません。
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {favoriteAuthors.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {f.author.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              読まれている本
            </h2>
            {readingStatuses.length === 0 ? (
              <p className="text-sm text-zinc-500">
                読書中・読了の本はまだありません。
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {readingStatuses.map((rs) => (
                  <li
                    key={rs.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        rs.status === "read"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : rs.status === "reading"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {STATUS_LABELS[rs.status] ?? rs.status}
                    </span>
                    <Link
                      href={`/books/${rs.book.id}`}
                      className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-200"
                    >
                      {rs.book.title}
                    </Link>
                    <span className="ml-auto text-xs text-zinc-500">
                      {rs.book.author.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
