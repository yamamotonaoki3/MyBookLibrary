"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

interface LoginFormProps {
  error?: string;
  callbackUrl?: string;
}

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "ACCOUNT_LOCKED")
    return "アカウントがロックされています。しばらくお待ちください。";
  if (error === "OAuthAccountNotLinked")
    return "このメールアドレスはパスワードで登録済みです。メールアドレスとパスワードでログインしてください。";
  if (error === "OAuthCallbackError")
    return "Googleログイン中にエラーが発生しました。しばらくしてから再度お試しください。";
  return null;
}

async function buildErrorMessage(error: string, email: string): Promise<string> {
  const fixed = getErrorMessage(error);
  if (fixed) return fixed;

  // パスワード誤入力時は残り試行回数を取得して表示
  try {
    const res = await fetch(
      `/api/auth/remaining-attempts?email=${encodeURIComponent(email)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { remaining: number | null };
      if (data.remaining !== null) {
        if (data.remaining > 0)
          return `パスワードが正しくありません。あと${data.remaining}回間違えるとアカウントがロックされます。`;
        return "アカウントがロックされています。しばらくお待ちください。";
      }
    }
  } catch {
    // fetch 失敗時はデフォルトメッセージにフォールバック
  }
  return "メールアドレスまたはパスワードが正しくありません。";
}

export function LoginForm({ error, callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(getErrorMessage(error));

  // ログイン保持フラグのチェック（remember me = false のときブラウザ終了でサインアウト）
  useEffect(() => {
    if (typeof window !== "undefined") {
      const remembered = localStorage.getItem("rememberMe");
      if (remembered === null) return; // 初回アクセス（まだログインしていない）
      // ページロード時に rememberMe=false なら何もしない（セッション自体はJWTで管理）
    }
  }, []);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const rememberMe = (form.get("rememberMe") as string) === "on";

    try {
      const result = await signIn("credentials", {
        email: form.get("email"),
        password: form.get("password"),
        redirect: false,
      });

      if (result?.error) {
        const email = form.get("email") as string;
        const msg = await buildErrorMessage(result.error, email);
        setFormError(msg);
      } else {
        if (rememberMe) {
          localStorage.setItem("rememberMe", "1");
          sessionStorage.removeItem("sessionActive");
        } else {
          localStorage.setItem("rememberMe", "0");
          sessionStorage.setItem("sessionActive", "1");
        }
        router.push(callbackUrl ?? "/");
        router.refresh();
      }
    } catch {
      setFormError("ログイン中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 lg:gap-5">
      {formError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 lg:px-4 lg:py-3 lg:text-sm">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="email">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-700 lg:h-11 lg:px-4 lg:text-base"
        />
      </div>

      <div className="flex flex-col gap-1 lg:gap-2">
        <label className="text-xs font-medium lg:text-sm" htmlFor="password">
          パスワード
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-700 lg:h-11 lg:px-4 lg:pr-11 lg:text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 lg:h-5 lg:w-5" />
            ) : (
              <Eye className="h-4 w-4 lg:h-5 lg:w-5" />
            )}
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs lg:text-sm">
        <input
          type="checkbox"
          name="rememberMe"
          className="h-3.5 w-3.5 rounded border-input accent-emerald-700 lg:h-4 lg:w-4"
        />
        ログイン状態を保持する
      </label>

      <Button
        type="submit"
        disabled={loading}
        className="h-9 w-full bg-emerald-700 text-sm text-white hover:bg-emerald-800 lg:h-11 lg:text-base"
      >
        {loading ? "ログイン中..." : "ログイン"}
      </Button>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-muted-foreground lg:text-sm">または</span>
        <div className="flex-1 border-t border-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-9 w-full gap-2 text-sm lg:h-11 lg:text-base"
        onClick={() => {
          sessionStorage.setItem("sessionActive", "1");
          signIn("google", { callbackUrl: callbackUrl ?? "/" });
        }}
      >
        <svg className="h-4 w-4 lg:h-5 lg:w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Googleでログイン
      </Button>

      <p className="text-center text-xs text-muted-foreground lg:text-sm">
        アカウントをお持ちでない方{" "}
        <Link
          href="/register"
          className="text-violet-600 underline underline-offset-4 hover:text-violet-700"
        >
          → 新規登録はこちら
        </Link>
      </p>
    </form>
  );
}
