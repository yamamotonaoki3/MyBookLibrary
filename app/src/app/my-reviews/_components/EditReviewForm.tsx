"use client";

import { useState } from "react";

type Props = {
  review: { id: number; body: string; isSpoiler: boolean; isPublic: boolean };
};

export default function EditReviewForm({ review }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentBody, setCurrentBody] = useState(review.body);
  const [currentIsSpoiler, setCurrentIsSpoiler] = useState(review.isSpoiler);
  const [currentIsPublic, setCurrentIsPublic] = useState(review.isPublic);
  const [editBody, setEditBody] = useState(review.body);
  const [editIsSpoiler, setEditIsSpoiler] = useState(review.isSpoiler);
  const [editIsPublic, setEditIsPublic] = useState(review.isPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setEditBody(currentBody);
    setEditIsSpoiler(currentIsSpoiler);
    setEditIsPublic(currentIsPublic);
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
  }

  const editBodyLength = editBody.trim().length;
  const isEditBodyInvalid = editBodyLength < 10 || editBodyLength > 2000;

  async function handleSave() {
    if (editBodyLength < 10) {
      setError("感想は10文字以上で入力してください。");
      return;
    }
    if (editBodyLength > 2000) {
      setError("感想は2000文字以内で入力してください。");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody, isSpoiler: editIsSpoiler, isPublic: editIsPublic }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "保存に失敗しました。");
        return;
      }

      setCurrentBody(editBody.trim());
      setCurrentIsSpoiler(editIsSpoiler);
      setCurrentIsPublic(editIsPublic);
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          {currentIsSpoiler && (
            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
              ネタバレあり
            </span>
          )}
          {!currentIsPublic && (
            <span className="inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              非公開
            </span>
          )}
        </div>
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
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        ※ 著者・作品に対する誹謗中傷が確認された場合、通報の対象となり削除されることがあります。
      </p>
      <textarea
        value={editBody}
        onChange={(e) => setEditBody(e.target.value)}
        rows={5}
        placeholder="感想を入力してください...（10文字以上2000文字以内）"
        className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-400"
      />
      <p className={`text-right text-xs ${editBodyLength > 2000 ? "text-red-500" : "text-zinc-400 dark:text-zinc-500"}`}>
        {editBodyLength} / 2000
      </p>
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
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={editIsPublic}
            onChange={(e) => setEditIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          />
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            全体に公開する
          </span>
        </label>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          ※ 公開した感想は他のユーザーも閲覧できます。チェックを外すと自分のみ閲覧できます。
        </p>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || isEditBodyInvalid}
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
