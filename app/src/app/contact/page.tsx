"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle } from "lucide-react";

const CATEGORIES = [
  { value: "general", label: "一般的なお問い合わせ" },
  { value: "bug", label: "不具合の報告" },
  { value: "feature", label: "機能追加の要望" },
  { value: "account", label: "アカウントについて" },
  { value: "other", label: "その他" },
] as const;

export default function ContactPage() {
  const { data: session } = useSession();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("送信に失敗しました。しばらくしてから再試行してください。");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-500" />
        <h1 className="mb-2 text-xl font-bold text-zinc-800 dark:text-zinc-100">
          お問い合わせを受け付けました
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          内容を確認のうえ、管理者が対応いたします。
        </p>
        <Button
          className="mt-8"
          variant="outline"
          onClick={() => {
            setSubmitted(false);
            setSubject("");
            setBody("");
            setCategory("");
          }}
        >
          別の問い合わせをする
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 lg:py-8">
      <div className="mb-6 flex w-full max-w-2xl items-center gap-3">
        <Mail className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
        <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
          お問い合わせ
        </h1>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base font-medium text-zinc-700 dark:text-zinc-300">
            管理者へのお問い合わせフォーム
          </CardTitle>
          {session?.user && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {session.user.name}（{session.user.email}）として送信します
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* カテゴリ */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                カテゴリ <span className="text-red-500">*</span>
              </label>
              <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      CATEGORIES.find((c) => c.value === v)?.label ?? "選択してください"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 件名 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                件名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                maxLength={100}
                placeholder="お問い合わせの件名"
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>

            {/* 本文 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                本文 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={6}
                placeholder="お問い合わせの内容を入力してください（10〜2000文字）"
                className="resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <p className="text-right text-xs text-zinc-400">{body.length} / 2000</p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading || !category} className="mt-2">
              {loading ? "送信中..." : "送信する"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
