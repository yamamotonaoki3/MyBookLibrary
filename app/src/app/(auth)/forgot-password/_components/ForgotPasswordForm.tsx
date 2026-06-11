"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

type Step = "email" | "reset";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const inputClass =
    "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-700 lg:h-11 lg:px-4 lg:text-base";

  async function handleCheckEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "check", email }),
      });

      if (res.ok) {
        setStep("reset");
      } else {
        const data = (await res.json()) as { error: string };
        if (data.error === "NOT_FOUND") {
          setError("入力されたメールアドレスは登録されていません。");
        } else if (data.error === "GOOGLE_ACCOUNT") {
          setError("このアカウントはGoogleでログインしています。Googleログインをご利用ください。");
        } else {
          setError("エラーが発生しました。しばらくしてから再度お試しください。");
        }
      }
    } catch {
      setError("エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "reset",
          email,
          password: form.get("password"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });

      if (res.ok) {
        router.push("/login?message=password_reset");
      } else {
        const data = (await res.json()) as { error: unknown };
        if (data.error && typeof data.error === "object") {
          setFieldErrors(data.error as Record<string, string[]>);
        } else {
          setError("パスワードの変更に失敗しました。");
        }
      }
    } catch {
      setError("エラーが発生しました。しばらくしてから再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={handleCheckEmail} className="flex flex-col gap-3 lg:gap-5">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 lg:px-4 lg:py-3 lg:text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1 lg:gap-2">
          <label className="text-xs font-medium lg:text-sm" htmlFor="email">
            登録済みメールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-9 w-full bg-emerald-700 text-sm text-white hover:bg-emerald-800 lg:h-11 lg:text-base"
        >
          {loading ? "確認中..." : "次へ"}
        </Button>

        <p className="text-center text-xs text-muted-foreground lg:text-sm">
          <Link
            href="/login"
            className="text-violet-600 underline underline-offset-4 hover:text-violet-700"
          >
            ← ログイン画面に戻る
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleReset} className="flex flex-col gap-3 lg:gap-5">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 lg:px-4 lg:py-3 lg:text-sm">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground lg:text-sm">
        <span className="font-medium text-foreground">{email}</span> の新しいパスワードを入力してください。
      </p>

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="password">
          新しいパスワード
          <span className="ml-1 text-xs font-normal text-muted-foreground">(8文字以上)</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
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
        {fieldErrors.password && (
          <p className="text-xs text-red-600">{fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="confirmPassword">
          新しいパスワード（確認）
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            required
            autoComplete="new-password"
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
        disabled={loading}
        className="h-9 w-full bg-emerald-700 text-sm text-white hover:bg-emerald-800 lg:h-11 lg:text-base"
      >
        {loading ? "変更中..." : "パスワードを変更する"}
      </Button>

      <p className="text-center text-xs text-muted-foreground lg:text-sm">
        <button
          type="button"
          onClick={() => { setStep("email"); setError(null); setFieldErrors({}); }}
          className="text-violet-600 underline underline-offset-4 hover:text-violet-700"
        >
          ← メールアドレスを変更する
        </button>
      </p>
    </form>
  );
}
