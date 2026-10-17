"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminFetch } from "@/lib/adminFetch";

/** 「表示」で出したメールアドレスを、マスクに戻すまでの時間。 */
export const REVEAL_VISIBLE_MS = 30_000;

export type EmailRevealTarget = { kind: "user" | "inquiry" | "audit-log"; id: number };

/**
 * メールアドレスをマスクして表示し、管理者が「表示」を押したときだけ全体を取得する
 * （取得のたびに監査ログへ記録される）。一定時間で、またはこの表示が消えるときに、マスクへ戻す。
 */
export function MaskedEmail({ masked, target }: { masked: string; target: EmailRevealTarget }) {
  const adminFetch = useAdminFetch();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setRevealed(null);
  };

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/email-reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.email !== "string") {
        setError(json.error ?? "表示できませんでした。");
        return;
      }
      setRevealed(json.email);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setRevealed(null), REVEAL_VISIBLE_MS);
    } catch {
      setError("表示できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 break-all">
      <span data-testid="masked-email">{revealed ?? masked}</span>
      <button
        type="button"
        onClick={revealed ? hide : reveal}
        disabled={busy}
        className="shrink-0 text-xs text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        {revealed ? "隠す" : "表示"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
