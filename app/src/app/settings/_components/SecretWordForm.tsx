"use client";

import { useState } from "react";

type Props = {
  isSet: boolean;
};

export function SecretWordForm({ isSet }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [secretWord, setSecretWord] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/user/secret-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, secretWord }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "設定に失敗しました");
        return;
      }
      setDone(true);
      setCurrentPassword("");
      setSecretWord("");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {done && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
          秘密の言葉を{isSet ? "変更" : "設定"}しました
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          現在のパスワード
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isSet ? "新しい秘密の言葉" : "秘密の言葉"}
          <span className="ml-1 text-xs font-normal text-zinc-400">(2〜50文字)</span>
        </label>
        <input
          type="text"
          value={secretWord}
          onChange={(e) => setSecretWord(e.target.value)}
          required
          minLength={2}
          maxLength={50}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "保存中..." : isSet ? "変更する" : "設定する"}
      </button>
    </form>
  );
}
