"use client";

import { useState } from "react";

type Props = {
  review: { id: number; body: string; isSpoiler: boolean };
};

export default function EditReviewForm({ review }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentBody, setCurrentBody] = useState(review.body);
  const [currentIsSpoiler, setCurrentIsSpoiler] = useState(review.isSpoiler);
  const [editBody, setEditBody] = useState(review.body);
  const [editIsSpoiler, setEditIsSpoiler] = useState(review.isSpoiler);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setEditBody(currentBody);
    setEditIsSpoiler(currentIsSpoiler);
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    if (editBody.trim() === "") {
      setError("感想を入力してください。");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody, isSpoiler: editIsSpoiler }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "保存に失敗しました。");
        return;
      }

      setCurrentBody(editBody.trim());
      setCurrentIsSpoiler(editIsSpoiler);
      setIsEditing(false);
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <div>
        {currentIsSpoiler && (
          <span className="mb-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
            ネタバレあり
          </span>
        )}
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {currentBody}
        </p>
        <button
          onClick={handleEdit}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          編集
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={editBody}
        onChange={(e) => setEditBody(e.target.value)}
        rows={5}
        className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-400"
      />
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={editIsSpoiler}
          onChange={(e) => setEditIsSpoiler(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
        />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          ネタバレを含む
        </span>
      </label>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
