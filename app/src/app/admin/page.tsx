"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type SearchResult = {
  title: string;
  author: string;
  isbn: string;
  publisherName: string;
  salesDate: string;
  coverImageUrl: string | null;
};

type Award = {
  id: number;
  name: string;
};

type AwardEntry = {
  id: number;
  year: number;
  type: string;
  award: { id: number; name: string };
  book: {
    id: number;
    title: string;
    coverImageUrl: string | null;
    author: { id: number; name: string };
  };
};

type FormState = {
  title: string;
  author: string;
  isbn: string;
  coverImageUrl: string;
  publishedAt: string;
  awardId: string;
  year: string;
  type: "winner" | "nominee";
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - i);

export default function AdminPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [awardsLoaded, setAwardsLoaded] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: "",
    author: "",
    isbn: "",
    coverImageUrl: "",
    publishedAt: "",
    awardId: "",
    year: String(CURRENT_YEAR),
    type: "winner",
  });
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<AwardEntry[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<"winner" | "nominee">("winner");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<{
    userCount: number;
    reviewCount: number;
    likeCount: number;
    newUsersThisMonth: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data));
  }, []);

  useEffect(() => {
    fetch("/api/admin/award-entries")
      .then((res) => res.json())
      .then((data: AwardEntry[]) => setEntries(data));
  }, [refreshKey]);

  function refreshEntries() {
    setRefreshKey((k) => k + 1);
  }

  async function loadAwards() {
    if (awardsLoaded) return;
    const res = await fetch("/api/awards");
    const data: Award[] = await res.json();
    setAwards(data);
    if (data.length > 0) setForm((f) => ({ ...f, awardId: String(data[0].id) }));
    setAwardsLoaded(true);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    await loadAwards();
    const res = await fetch(
      `/api/books/search?q=${encodeURIComponent(query)}&type=title`
    );
    const data = await res.json();
    setResults(Array.isArray(data.items) ? data.items : []);
    setSearching(false);
  }

  function handleSelect(book: SearchResult) {
    setForm((f) => ({
      ...f,
      title: book.title,
      author: book.author,
      isbn: book.isbn ?? "",
      coverImageUrl: book.coverImageUrl ?? "",
      publishedAt: book.salesDate ?? "",
    }));
    setRegisterResult(null);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setRegisterResult(null);
    const res = await fetch("/api/admin/award-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        author: form.author,
        isbn: form.isbn || null,
        coverImageUrl: form.coverImageUrl || null,
        publishedAt: form.publishedAt || null,
        awardId: parseInt(form.awardId),
        year: parseInt(form.year),
        type: form.type,
      }),
    });
    if (res.ok) {
      setRegisterResult("登録しました。");
      refreshEntries();
    } else {
      const data = await res.json();
      setRegisterResult(`エラー: ${data.error ?? "登録に失敗しました。"}`);
    }
    setRegistering(false);
  }

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", csvFile);
    const res = await fetch("/api/admin/import-csv", { method: "POST", body: formData });
    const data = await res.json();
    setImportResult(data);
    setImporting(false);
    refreshEntries();
  }

  async function handleDelete(id: number) {
    if (!confirm("この受賞登録を削除しますか？")) return;
    setDeletingId(id);
    await fetch(`/api/admin/award-entries/${id}`, { method: "DELETE" });
    setDeletingId(null);
    refreshEntries();
  }

  function startEdit(entry: AwardEntry) {
    setEditingId(entry.id);
    setEditingType(entry.type as "winner" | "nominee");
  }

  async function handleEditSave(id: number) {
    await fetch(`/api/admin/award-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: editingType }),
    });
    setEditingId(null);
    refreshEntries();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-xl font-bold text-zinc-900 dark:text-zinc-50">
        📋 受賞・ノミネート作品の登録
      </h1>

      {/* 統計情報 */}
      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          統計情報
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "登録ユーザー数", value: stats?.userCount },
            { label: "今月の新規ユーザー", value: stats?.newUsersThisMonth },
            { label: "総レビュー数", value: stats?.reviewCount },
            { label: "総いいね数", value: stats?.likeCount },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md bg-zinc-50 p-4 dark:bg-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {value === undefined ? "..." : value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 楽天API検索 */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          書籍タイトルで検索（楽天ブックスAPIから自動取得）
        </h2>
        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトルを入力..."
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </form>

        {results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map((book, i) => (
              <li
                key={book.isbn || i}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="relative h-16 w-10 flex-shrink-0 overflow-hidden rounded">
                  {book.coverImageUrl ? (
                    <Image
                      src={book.coverImageUrl}
                      alt={book.title}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-[9px] text-zinc-400 dark:bg-zinc-800">
                      No Image
                    </div>
                  )}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{book.title}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {book.author} / {book.salesDate}
                  </p>
                </div>
                <button
                  onClick={() => handleSelect(book)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  選択
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 登録フォーム */}
      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          登録情報の確認・入力
        </h2>
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              タイトル
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              著者名
            </label>
            <input
              type="text"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              出版年
            </label>
            <input
              type="text"
              value={form.publishedAt}
              onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              placeholder="例: 2024年01月"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              文学賞
            </label>
            <select
              value={form.awardId}
              onChange={(e) => setForm((f) => ({ ...f, awardId: e.target.value }))}
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              {awards.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              種別
            </label>
            <div className="flex gap-6">
              {(["winner", "nominee"] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={form.type === t}
                    onChange={() => setForm((f) => ({ ...f, type: t }))}
                  />
                  {t === "winner" ? "受賞作" : "ノミネート"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              受賞年度
            </label>
            <select
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </div>

          {registerResult && (
            <p
              className={`text-sm ${registerResult.startsWith("エラー") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
            >
              {registerResult}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={registering || !form.title || !form.author || !form.awardId}
              className="rounded-md bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {registering ? "登録中..." : "登録する"}
            </button>
          </div>
        </form>
      </section>

      {/* CSVインポート */}
      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          CSVから一括インポート
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          フォーマット（ヘッダー行任意）: title, author, isbn, coverImageUrl, publishedAt, awardId, year, type
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            className="text-sm text-zinc-600 dark:text-zinc-400"
          />
          <button
            onClick={handleImport}
            disabled={!csvFile || importing}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {importing ? "インポート中..." : "インポート実行"}
          </button>
        </div>

        {importResult && (
          <div className="mt-4 rounded-md bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
            <p className="font-medium text-green-600 dark:text-green-400">
              成功: {importResult.success} 件
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-red-600 dark:text-red-400">
                {importResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 受賞登録一覧 */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">
          受賞登録一覧
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">登録されていません。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left">文学賞</th>
                  <th className="px-4 py-3 text-left">年度</th>
                  <th className="px-4 py-3 text-left">タイトル</th>
                  <th className="px-4 py-3 text-left">著者</th>
                  <th className="px-4 py-3 text-left">種別</th>
                  <th className="px-4 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {entry.award.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{entry.year}年</td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {entry.book.title}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {entry.book.author.name}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === entry.id ? (
                        <select
                          value={editingType}
                          onChange={(e) =>
                            setEditingType(e.target.value as "winner" | "nominee")
                          }
                          className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                        >
                          <option value="winner">受賞作</option>
                          <option value="nominee">ノミネート</option>
                        </select>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            entry.type === "winner"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {entry.type === "winner" ? "受賞作" : "ノミネート"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {editingId === entry.id ? (
                          <>
                            <button
                              onClick={() => handleEditSave(entry.id)}
                              className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              キャンセル
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(entry)}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              {deletingId === entry.id ? "削除中..." : "削除"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
