import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** パスワード変更画面（`/settings/change-password`）へのリンク。設定画面の「パスワード」の欄に置く。 */
export function ChangePasswordLink() {
  return (
    <Link
      href="/settings/change-password"
      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <span>パスワードを変更する</span>
      <ChevronRight className="h-4 w-4 text-zinc-400" />
    </Link>
  );
}
