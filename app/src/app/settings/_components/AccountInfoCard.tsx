type Props = {
  name: string | null;
  email: string | null;
  isAdmin: boolean;
};

export function AccountInfoCard({ name, email, isAdmin }: Props) {
  const roleLabel = isAdmin ? "管理者" : "一般ユーザー";

  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-3">
        <dt className="w-20 shrink-0 text-zinc-500">名前</dt>
        <dd className="text-zinc-900 dark:text-zinc-50">{name ?? "未設定"}</dd>
      </div>
      <div className="flex items-center gap-3">
        <dt className="w-20 shrink-0 text-zinc-500">メール</dt>
        <dd className="break-all text-zinc-900 dark:text-zinc-50">{email ?? "未設定"}</dd>
      </div>
      <div className="flex items-center gap-3">
        <dt className="w-20 shrink-0 text-zinc-500">ロール</dt>
        <dd className="text-zinc-900 dark:text-zinc-50">{roleLabel}</dd>
      </div>
    </dl>
  );
}
