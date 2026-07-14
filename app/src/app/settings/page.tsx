import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
import { LibrarySettings } from "./_components/LibrarySettings";
import { SecretWordForm } from "./_components/SecretWordForm";

export const metadata: Metadata = {
  title: "設定 | MyBookLibrary",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";

  const myUserId = Number(session.user.id);

  const [currentUser, followingCount, followerCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myUserId },
      select: { password: true, secretWordHash: true },
    }),
    prisma.follow.count({ where: { followerId: myUserId } }),
    prisma.follow.count({ where: { followingId: myUserId } }),
  ]);
  const hasPasswordLogin = !!currentUser?.password;
  const hasSecretWord = !!currentUser?.secretWordHash;

  return (
    <div className="flex flex-col px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight lg:text-3xl">設定</h1>

      <div className="flex max-w-lg flex-col gap-6">
        {/* アカウント情報 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            アカウント情報
          </h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-zinc-500">名前</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{session.user.name ?? "未設定"}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-zinc-500">メール</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{session.user.email ?? "未設定"}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-20 shrink-0 text-zinc-500">ロール</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {isAdmin ? "管理者" : "一般ユーザー"}
              </dd>
            </div>
          </dl>
        </section>

        {/* フォロー */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            フォロー
          </h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            フォロー中 {followingCount}人 ／ フォロワー {followerCount}人
          </p>
          <Link
            href="/settings/follows"
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            一覧を見る →
          </Link>
        </section>

        {/* 近隣図書館の設定 */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            近隣図書館の設定
          </h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            登録した図書館の貸出状況を本一覧から確認できます。
          </p>
          <LibrarySettings />
        </section>

        {/* 秘密の言葉 */}
        {hasPasswordLogin && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              秘密の言葉
            </h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              パスワードを忘れた際の本人確認に使用します。設定しない場合、パスワードリセットは行えません。
            </p>
            <SecretWordForm isSet={hasSecretWord} />
          </section>
        )}

        {/* アカウント削除 */}
        {!isAdmin && (
          <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-zinc-900">
            <h2 className="mb-2 text-base font-semibold text-red-600 dark:text-red-400">
              アカウント削除
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              アカウントを削除すると、すべてのデータ（読書記録・感想・お気に入りなど）が完全に削除されます。この操作は取り消せません。
            </p>
            <DeleteAccountButton />
          </section>
        )}
      </div>
    </div>
  );
}
