"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  targetUserId: number;
  targetUserName: string;
  initialFollowing: boolean;
  onChanged?: () => void;
};

export default function FollowButton({
  targetUserId,
  targetUserName,
  initialFollowing,
  onChanged,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    if (pending) return;
    setPending(true);

    try {
      const res = await fetch("/api/follows", {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      if (res.ok || res.status === 409) {
        setFollowing(!following);
        router.refresh();
        onChanged?.();
      }
    } catch {
      // 失敗時は状態を変えない
    } finally {
      setPending(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          following
            ? "border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            : "border-blue-500 bg-blue-500 text-white hover:bg-blue-600 dark:border-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
        }`}
      >
        {following ? "フォロー中" : "フォロー"}
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {following
                ? `${targetUserName}さんのフォローを解除しますか？`
                : `${targetUserName}さんをフォローしますか？`}
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              {following
                ? "フォローを解除すると、相互フォローで公開されていたお互いの情報は見られなくなります。"
                : "相互フォローになると、あなたのお気に入り著者や読んでいる本が相手に分かるようになります。"}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={pending}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                  following
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                {following ? "解除する" : "フォローする"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
