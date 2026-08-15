import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChangePasswordForm } from "./_components/ChangePasswordForm";

export const metadata: Metadata = {
  title: "パスワードの変更 | MyBookLibrary",
};

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight lg:text-3xl">パスワードの変更</h1>
      {session.user.mustChangePassword && (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          管理者によりパスワードがリセットされました。続行するには新しいパスワードを設定してください。
        </p>
      )}
      <div className="max-w-md">
        <ChangePasswordForm forced={session.user.mustChangePassword} />
      </div>
    </div>
  );
}
