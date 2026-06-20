"use client";

import { useState } from "react";

type ReadingStatus = "want_to_read" | "reading" | "read";

const STATUS_LABELS: Record<ReadingStatus, string> = {
  want_to_read: "読みたい",
  reading: "読書中",
  read: "読了",
};

type Props = {
  onClose: () => void;
  onRegistered: (message: string) => void;
};

export default function ManualBookRegisterModal({ onClose, onRegistered }: Props) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [status, setStatus] = useState<ReadingStatus>("want_to_read");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "タイトルを入力してください";
    else if (title.trim().length > 200) errs.title = "200文字以内で入力してください";
    if (!author.trim()) errs.author = "著者名を入力してください";
    else if (author.trim().length > 100) errs.author = "100文字以内で入力してください";
    if (coverImageUrl.trim() && !/^https?:\/\/.+/.test(coverImageUrl.trim())) {
      errs.coverImageUrl = "有効なURLを入力してください";
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        title: title.trim(),
        author: author.trim(),
        status,
        source: "manual",
        isbn: isbn.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        publishedAt: publishedAt.trim() || null,
      };
      const res = await fetch("/api/reading-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error ?? "登録に失敗しました" });
        return;
      }
      onRegistered(`「${title.trim()}」を${STATUS_LABELS[status]}として登録しました`);
      onClose();
    } catch {
      setErrors({ submit: "通信エラーが発生しました" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 pt-4 pb-24">
      <div className="relative mx-auto w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          本を手動で登録
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：吾輩は猫である"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              著者名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="例：夏目漱石"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {errors.author && <p className="mt-1 text-xs text-red-500">{errors.author}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              読書ステータス
            </label>
            <div className="flex gap-2">
              {(["want_to_read", "reading", "read"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    status === s
                      ? s === "read"
                        ? "bg-green-600 text-white"
                        : s === "reading"
                          ? "bg-blue-600 text-white"
                          : "bg-orange-500 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              ISBN <span className="text-zinc-400 font-normal">（任意）</span>
            </label>
            <input
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="例：9784101010014"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              出版日 <span className="text-zinc-400 font-normal">（任意）</span>
            </label>
            <input
              type="text"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              placeholder="例：2024年04月01日"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              表紙画像URL <span className="text-zinc-400 font-normal">（任意）</span>
            </label>
            <input
              type="text"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="例：https://example.com/cover.jpg"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {errors.coverImageUrl && <p className="mt-1 text-xs text-red-500">{errors.coverImageUrl}</p>}
          </div>

          {errors.submit && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {errors.submit}
            </p>
          )}

          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "登録中…" : "登録する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
