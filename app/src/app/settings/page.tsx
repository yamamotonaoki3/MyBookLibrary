import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Users, Heart, Library, KeyRound, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { AccountInfoCard } from "./_components/AccountInfoCard";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
import { LibrarySettings } from "./_components/LibrarySettings";
import { SecretWordForm } from "./_components/SecretWordForm";
import { SettingsAccordionSection } from "./_components/SettingsAccordionSection";

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
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            フォロー中 {followingCount}人 ／ フォロワー {followerCount}人
          </p>
          <Button render={<Link href="/settings/follows" />} nativeButton={false} size="sm">
            一覧表示
          </Button>
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
      </div>
    </div>
  );
}
