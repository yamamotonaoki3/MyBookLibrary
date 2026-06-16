"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Settings,
  Users,
  UserPlus,
  MessageSquare,
  Heart,
  Search,
  BookOpen,
  Upload,
  Trophy,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

type ReportedReview = {
  id: number;
  body: string;
  reportCount: number;
  user: { name: string };
  book: { id: number; title: string };
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
const YEARS = Array.from({ length: CURRENT_YEAR - 1935 + 1 }, (_, i) => CURRENT_YEAR - i);

const STAT_CARDS = [
  {
    key: "userCount" as const,
    label: "登録ユーザー数",
    icon: Users,
    gradient: "from-emerald-400 to-teal-500",
    shadow: "shadow-emerald-200",
  },
  {
    key: "newUsersThisMonth" as const,
    label: "今月の新規ユーザー",
    icon: UserPlus,
    gradient: "from-blue-400 to-cyan-500",
    shadow: "shadow-blue-200",
  },
  {
    key: "reviewCount" as const,
    label: "総レビュー数",
    icon: MessageSquare,
    gradient: "from-purple-500 to-indigo-600",
    shadow: "shadow-purple-200",
  },
  {
    key: "likeCount" as const,
    label: "総いいね数",
    icon: Heart,
    gradient: "from-orange-400 to-pink-500",
    shadow: "shadow-orange-200",
  },
];

export default function AdminPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ? Number(session.user.id) : null;

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

  function formatSalesDate(raw: string): string {
    if (!raw) return "";
    const m8 = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m8) {
      const day = m8[3] === "00" ? "" : `${m8[3]}日`;
      return `${m8[1]}年${m8[2]}月${day}`;
    }
    const mJa = raw.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (mJa) {
      const month = String(mJa[2]).padStart(2, "0");
      const day = mJa[3] ? `${String(mJa[3]).padStart(2, "0")}日` : "";
      return `${mJa[1]}年${month}月${day}`;
    }
    return raw;
  }

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<AwardEntry[]>([]);
  const [selectedAwardTab, setSelectedAwardTab] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<"winner" | "nominee">("winner");
  const [editingYear, setEditingYear] = useState<number>(CURRENT_YEAR);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingAuthor, setEditingAuthor] = useState("");
  const [editingAwardId, setEditingAwardId] = useState<number>(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<{
    userCount: number;
    reviewCount: number;
    likeCount: number;
    newUsersThisMonth: number;
  } | null>(null);
  const [reportedReviews, setReportedReviews] = useState<ReportedReview[]>([]);
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);
  const [deleteTargetReviewId, setDeleteTargetReviewId] = useState<number | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserRow | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data));
  }, []);

  useEffect(() => {
    fetch("/api/admin/reported-reviews")
      .then((res) => res.json())
      .then((data: ReportedReview[]) => setReportedReviews(data));
  }, []);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data: UserRow[]) => setUsers(data));
  }, []);

  async function executeDeleteUser() {
    if (!deleteTargetUser) return;
    const target = deleteTargetUser;
    setDeletingUserId(target.id);
    setDeleteTargetUser(null);
    const res = await fetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
    setDeletingUserId(null);
    if (!res.ok) {
      alert("ユーザーの削除に失敗しました。");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== target.id));
  }

  function handleDeleteReview(id: number) {
    setDeleteTargetReviewId(id);
  }

  async function executeDeleteReview() {
    if (deleteTargetReviewId === null) return;
    const targetId = deleteTargetReviewId;
    setDeletingReviewId(targetId);
    setDeleteTargetReviewId(null);
    const res = await fetch(`/api/admin/reviews/${targetId}`, { method: "DELETE" });
    setDeletingReviewId(null);
    if (!res.ok) {
      alert("レビューの削除に失敗しました。");
      return;
    }
    setReportedReviews((prev) => prev.filter((r) => r.id !== targetId));
  }

  useEffect(() => {
    fetch("/api/admin/award-entries")
      .then((res) => res.json())
      .then((data: AwardEntry[]) => setEntries(data));
  }, [refreshKey]);

  function refreshEntries() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    loadAwards();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      `/api/books/search?q=${encodeURIComponent(query)}&type=keyword`
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
      publishedAt: formatSalesDate(book.salesDate ?? ""),
    }));
    setResults([]);
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
    setEditingYear(entry.year);
    setEditingTitle(entry.book.title);
    setEditingAuthor(entry.book.author.name);
    setEditingAwardId(entry.award.id);
    setEditModalOpen(true);
  }

  async function handleEditSave(id: number) {
    setEditSaving(true);
    await fetch(`/api/admin/award-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingTitle,
        author: editingAuthor,
        awardId: editingAwardId,
        year: editingYear,
        type: editingType,
      }),
    });
    setEditSaving(false);
    setEditingId(null);
    setEditModalOpen(false);
    refreshEntries();
  }

  return (
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-5 flex items-center gap-2 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        <Settings className="h-6 w-6 lg:h-7 lg:w-7" />
        管理画面
      </h1>

      <div className="flex-1 overflow-y-auto">

        {/* 統計カード */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STAT_CARDS.map(({ key, label, icon: Icon, gradient, shadow }) => (
            <div
              key={key}
              className={`flex flex-col rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg ${shadow}`}
            >
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium text-white/75 leading-tight">{label}</p>
              <p className="text-2xl font-bold">
                {stats === null ? "..." : stats[key]}
              </p>
            </div>
          ))}
        </div>

        {/* 楽天API検索 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <Search className="h-4 w-4" />書籍キーワードで検索
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">楽天ブックスAPIから自動取得。スペース区切りで「タイトル 著者名」のようにAND検索で絞り込めます。</p>
            <form onSubmit={handleSearch} className="mb-4 flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例: 容疑者Xの献身 東野圭吾（タイトル 著者名）"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <Button type="submit" disabled={searching} size="sm" className="shrink-0 whitespace-nowrap">
                {searching ? "検索中..." : "検索"}
              </Button>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelect(book)}
                    >
                      選択
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 登録フォーム */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <BookOpen className="h-4 w-4" />登録情報の確認・入力
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                  placeholder="例: 2024年01月15日（日付不明な場合は 2024年01月）"
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
                <Button
                  type="submit"
                  disabled={registering || !form.title || !form.author || !form.awardId}
                >
                  {registering ? "登録中..." : "登録する"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* CSVインポート */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <Upload className="h-4 w-4" />CSVから一括インポート
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-muted-foreground">
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
              <Button
                onClick={handleImport}
                disabled={!csvFile || importing}
                size="sm"
              >
                {importing ? "インポート中..." : "インポート実行"}
              </Button>
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
          </CardContent>
        </Card>

        {/* 受賞登録一覧 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <Trophy className="h-4 w-4" />受賞登録一覧
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">登録されていません。</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedAwardTab("all")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedAwardTab === "all"
                        ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    すべて（{entries.length}）
                  </button>
                  {awards.map((a) => {
                    const count = entries.filter((e) => e.award.name === a.name).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAwardTab(a.name)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          selectedAwardTab === a.name
                            ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {a.name}（{count}）
                      </button>
                    );
                  })}
                </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm whitespace-nowrap">
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
                    {(selectedAwardTab === "all"
                      ? entries
                      : entries.filter((e) => e.award.name === selectedAwardTab)
                    ).map((entry) => (
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
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              entry.type === "winner"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {entry.type === "winner" ? "受賞作" : "ノミネート"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(entry)}
                            >
                              編集
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                            >
                              {deletingId === entry.id ? "削除中..." : "削除"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ユーザー管理 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <Trash2 className="h-4 w-4" />ユーザー管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">ユーザーがいません。</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 text-left">名前</th>
                      <th className="px-4 py-3 text-left">メールアドレス</th>
                      <th className="px-4 py-3 text-left">ロール</th>
                      <th className="px-4 py-3 text-left">登録日</th>
                      <th className="px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                    {users.map((user) => {
                      const isMyself = currentUserId === user.id;
                      const isAdmin = user.role === "admin";
                      const canDelete = !isMyself && !isAdmin;
                      return (
                        <tr key={user.id}>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                            {user.name}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {user.email}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                isAdmin
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {isAdmin ? "管理者" : "ユーザー"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                          </td>
                          <td className="px-4 py-3">
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteTargetUser(user)}
                                disabled={deletingUserId === user.id}
                              >
                                {deletingUserId === user.id ? "削除中..." : "削除"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 通報されたレビュー */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />通報されたレビュー
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportedReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">通報されたレビューはありません。</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {reportedReviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-lg border border-red-200 bg-white p-4 dark:border-red-900/40 dark:bg-zinc-900"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {review.user.name}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">
                          『{review.book.title}』
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          通報 {review.reportCount}件
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteReview(review.id)}
                        disabled={deletingReviewId === review.id}
                      >
                        {deletingReviewId === review.id ? "削除中..." : "削除"}
                      </Button>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">
                      {review.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>

      <ConfirmDialog
        open={deleteTargetReviewId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetReviewId(null); }}
        title="レビューを削除しますか？"
        description="削除したレビューは元に戻せません。"
        confirmLabel="削除する"
        onConfirm={executeDeleteReview}
      />

      <ConfirmDialog
        open={deleteTargetUser !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetUser(null); }}
        title="ユーザーを削除しますか？"
        description={`「${deleteTargetUser?.name}」のアカウントとすべての関連データ（レビュー・いいね・読書状態など）を完全に削除します。この操作は元に戻せません。`}
        confirmLabel="削除する"
        onConfirm={executeDeleteUser}
      />

      {/* 受賞登録 編集モーダル */}
      {editModalOpen && editingId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setEditModalOpen(false); }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">受賞登録を編集</h2>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">タイトル</label>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">著者名</label>
                <input
                  type="text"
                  value={editingAuthor}
                  onChange={(e) => setEditingAuthor(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">文学賞</label>
                <select
                  value={editingAwardId}
                  onChange={(e) => setEditingAwardId(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {awards.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">受賞年度</label>
                <select
                  value={editingYear}
                  onChange={(e) => setEditingYear(Number(e.target.value))}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}年</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">種別</label>
                <div className="flex gap-6">
                  {(["winner", "nominee"] as const).map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="editingType"
                        value={t}
                        checked={editingType === t}
                        onChange={() => setEditingType(t)}
                      />
                      {t === "winner" ? "受賞作" : "ノミネート"}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={() => handleEditSave(editingId)} disabled={editSaving}>
                {editSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
