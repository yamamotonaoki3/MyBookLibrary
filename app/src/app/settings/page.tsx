import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Users, Heart, Library, KeyRound, Trash2, Info, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getFollowsListData } from "@/lib/followsListData";
import { getRecommendedUsers } from "@/lib/userRecommendations";
import { AccountInfoCard } from "./_components/AccountInfoCard";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
import { LibrarySettings } from "./_components/LibrarySettings";
import { SecretWordForm } from "./_components/SecretWordForm";
import { SettingsAccordionSection } from "./_components/SettingsAccordionSection";
import { FollowsTabs } from "./_components/FollowsTabs";

export const metadata: Metadata = {
  title: "設定 | MyBookLibrary",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "admin";

  const myUserId = Number(session.user.id);

  const [currentUser, { following, followers }, recommendations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: myUserId },
      select: { password: true, secretWordHash: true },
    }),
    getFollowsListData(myUserId),
    getRecommendedUsers(myUserId),
  ]);
  const hasPasswordLogin = !!currentUser?.password;
  const hasSecretWord = !!currentUser?.secretWordHash;

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-6 shrink-0 text-2xl font-bold tracking-tight lg:text-3xl">設定</h1>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg">
          {/* アカウント情報 */}
          <SettingsAccordionSection icon={<Users className="h-4 w-4" />} title="アカウント情報">
            <AccountInfoCard
              name={session.user.name ?? null}
              email={session.user.email ?? null}
              isAdmin={isAdmin}
            />
          </SettingsAccordionSection>

          {/* フォロー */}
          <SettingsAccordionSection icon={<Heart className="h-4 w-4" />} title="フォロー">
            <FollowsTabs
              following={following}
              followers={followers}
              recommendations={recommendations}
              viewAllHref="/settings/follows"
            />
          </SettingsAccordionSection>

          {/* 近隣図書館の設定 */}
          <SettingsAccordionSection icon={<Library className="h-4 w-4" />} title="近隣図書館の設定">
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              登録した図書館の貸出状況を本一覧から確認できます。
            </p>
            <LibrarySettings />
          </SettingsAccordionSection>

          {/* 秘密の言葉 */}
          {hasPasswordLogin && (
            <SettingsAccordionSection icon={<KeyRound className="h-4 w-4" />} title="秘密の言葉">
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                パスワードを忘れた際の本人確認に使用します。設定しない場合、パスワードリセットは行えません。
              </p>
              <SecretWordForm isSet={hasSecretWord} />
            </SettingsAccordionSection>
          )}

          {/* アカウント削除 */}
          {!isAdmin && (
            <SettingsAccordionSection
              icon={<Trash2 className="h-4 w-4" />}
              title="アカウント削除"
              className="border border-red-200 dark:border-red-900"
              titleClassName="text-red-600 dark:text-red-400"
            >
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                アカウントを削除すると、すべてのデータ（読書記録・感想・お気に入りなど）が完全に削除されます。この操作は取り消せません。
              </p>
              <DeleteAccountButton />
            </SettingsAccordionSection>
          )}

          {/* このアプリについて */}
          <Link
            href="/about"
            className="mb-6 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              このアプリについて
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
