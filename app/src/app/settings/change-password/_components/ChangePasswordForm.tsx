"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  forced: boolean;
};

const inputClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-700 lg:h-11 lg:px-4 lg:text-base";

export function ChangePasswordForm({ forced }: Props) {
  const router = useRouter();
  const { update } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: ["パスワードが一致しません"] });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error && typeof data.error === "object") {
          setFieldErrors(data.error as Record<string, string[]>);
        } else {
          setError(typeof data.error === "string" ? data.error : "パスワードの変更に失敗しました");
        }
        return;
      }

      // mustChangePasswordの解除をJWTへ反映させてからリダイレクトする
      await update({});
      router.push(forced ? "/" : "/settings");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 lg:gap-5">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="currentPassword">
          現在のパスワード
        </label>
        <div className="relative">
          <input
            id="currentPassword"
            type={showCurrent ? "text" : "password"}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={`${inputClass} pr-10 lg:pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showCurrent ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showCurrent ? <EyeOff className="h-4 w-4 lg:h-5 lg:w-5" /> : <Eye className="h-4 w-4 lg:h-5 lg:w-5" />}
          </button>
        </div>
        {fieldErrors.currentPassword && (
          <p className="text-xs text-red-600">{fieldErrors.currentPassword[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="password">
          新しいパスワード
          <span className="ml-1 text-xs font-normal text-muted-foreground">(8文字以上)</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-10 lg:pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showPassword ? <EyeOff className="h-4 w-4 lg:h-5 lg:w-5" /> : <Eye className="h-4 w-4 lg:h-5 lg:w-5" />}
          </button>
        </div>
        {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password[0]}</p>}
      </div>

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="confirmPassword">
          新しいパスワード（確認）
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirm ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`${inputClass} pr-10 lg:pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showConfirm ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showConfirm ? <EyeOff className="h-4 w-4 lg:h-5 lg:w-5" /> : <Eye className="h-4 w-4 lg:h-5 lg:w-5" />}
          </button>
        </div>
        {fieldErrors.confirmPassword && (
          <p className="text-xs text-red-600">{fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={saving}
        className="h-9 w-full bg-emerald-700 text-sm text-white hover:bg-emerald-800 lg:h-11 lg:text-base"
      >
        {saving ? "変更中..." : "パスワードを変更する"}
      </Button>
    </form>
  );
}
