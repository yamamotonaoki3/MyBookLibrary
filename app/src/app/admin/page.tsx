"use client";

import Image from "next/image";
import { useRef, useState } from "react";

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
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-8 text-xl font-bold text-zinc-900 dark:text-zinc-50">
        📋 受賞・ノミネート作品の登録
      </h1>

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
      <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
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
    </main>
  );
}
