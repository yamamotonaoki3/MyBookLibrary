"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
  Download,
  Trophy,
  AlertTriangle,
  Trash2,
  ChevronDown,
  Mail,
  Library,
  ScrollText,
  UserCog,
  KeyRound,
  Copy,
  Check,
  Info,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccountInfoCard } from "@/app/settings/_components/AccountInfoCard";
import { LibrarySettings } from "@/app/settings/_components/LibrarySettings";
import { FollowsTabs } from "@/app/settings/_components/FollowsTabs";
import { SecretWordForm } from "@/app/settings/_components/SecretWordForm";
import type { UserItem } from "@/lib/followsListData";
import type { RecommendedUser } from "@/lib/userRecommendations";
import { AuditLogsView } from "./audit-logs/AuditLogsView";
import { useAdminFetch } from "@/lib/adminFetch";
import { BookEnrichmentPanel } from "./_components/BookEnrichmentPanel";

type AdminTab = "settings" | "audit" | "management";

const ADMIN_TABS: { key: AdminTab; label: string; icon: typeof Settings }[] = [
  { key: "settings", label: "設定", icon: UserCog },
  { key: "management", label: "管理", icon: Settings },
  { key: "audit", label: "監査ログ", icon: ScrollText },
];

type SearchResult = {
  title: string;
  author: string;
  isbn: string;
  publisherName: string;
  salesDate: string;
  size: string;
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
    isbn: string | null;
    coverImageUrl: string | null;
    author: { id: number; name: string };
    bookIsbns: { isbn: string; isPrimary: boolean }[];
  };
};

type ManualBook = {
  id: number;
  title: string;
  isbn: string | null;
  coverImageUrl: string | null;
  author: { id: number; name: string };
  createdByUser: { id: number; name: string; email: string } | null;
  _count: { readingStatuses: number; reviews: number };
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

const CATEGORY_LABEL: Record<string, string> = {
  general: "一般的なお問い合わせ",
  bug: "不具合の報告",
  feature: "機能追加の要望",
  account: "アカウントについて",
  other: "その他",
};

type Inquiry = {
  id: number;
  name: string;
  email: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  user: { name: string; email: string } | null;
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
  const adminFetch = useAdminFetch();

  const [activeTab, setActiveTab] = useState<AdminTab>("management");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<"rakuten" | "ndl">("rakuten");
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [entries, setEntries] = useState<AwardEntry[]>([]);
  const [selectedAwardTab, setSelectedAwardTab] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<"winner" | "nominee">("winner");
  const [editingYear, setEditingYear] = useState<number>(CURRENT_YEAR);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingAuthor, setEditingAuthor] = useState("");
  const [editingIsbns, setEditingIsbns] = useState<{ isbn: string; isPrimary: boolean }[]>([]);
  const [editingAwardId, setEditingAwardId] = useState<number>(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
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
  const [changingRoleUserId, setChangingRoleUserId] = useState<number | null>(null);
  const [roleChangeTargetUser, setRoleChangeTargetUser] = useState<UserRow | null>(null);
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserRow | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<number | null>(null);
  const [resetPasswordTargetUser, setResetPasswordTargetUser] = useState<UserRow | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ user: UserRow; tempPassword: string } | null>(null);
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [reportedReviewsOpen, setReportedReviewsOpen] = useState(false);
  const [csvImportModalOpen, setCsvImportModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [registerFormOpen, setRegisterFormOpen] = useState(false);
  const [nearbyLibrariesOpen, setNearbyLibrariesOpen] = useState(false);
  const [followsOpen, setFollowsOpen] = useState(false);
  const [followsData, setFollowsData] = useState<{ following: UserItem[]; followers: UserItem[] }>({
    following: [],
    followers: [],
  });
  const [followRecommendations, setFollowRecommendations] = useState<RecommendedUser[]>([]);
  const [followsRefreshKey, setFollowsRefreshKey] = useState(0);
  const [accountInfoOpen, setAccountInfoOpen] = useState(false);
  const [secretWordOpen, setSecretWordOpen] = useState(false);
  const [hasPasswordLogin, setHasPasswordLogin] = useState(false);
  const [hasSecretWord, setHasSecretWord] = useState(false);
  const [awardsOpen, setAwardsOpen] = useState(false);
  const [selectedAwardEntryForDetail, setSelectedAwardEntryForDetail] = useState<AwardEntry | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiriesOpen, setInquiriesOpen] = useState(false);
  const [updatingInquiryId, setUpdatingInquiryId] = useState<number | null>(null);
  const [deletingInquiryId, setDeletingInquiryId] = useState<number | null>(null);
  const [deleteTargetInquiry, setDeleteTargetInquiry] = useState<Inquiry | null>(null);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);

  const [manualBooks, setManualBooks] = useState<ManualBook[]>([]);
  const [manualBooksOpen, setManualBooksOpen] = useState(false);
  const [manualBooksRefreshKey, setManualBooksRefreshKey] = useState(0);
  const [deleteTargetManualBook, setDeleteTargetManualBook] = useState<ManualBook | null>(null);
  const [deletingManualBookId, setDeletingManualBookId] = useState<number | null>(null);
  const [editingManualBookId, setEditingManualBookId] = useState<number | null>(null);
  const [editingManualBookTitle, setEditingManualBookTitle] = useState("");
  const [editingManualBookAuthor, setEditingManualBookAuthor] = useState("");
  const [editingManualBookIsbn, setEditingManualBookIsbn] = useState("");
  const [manualBookSaving, setManualBookSaving] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string>("");
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [selectedManualBookForDetail, setSelectedManualBookForDetail] = useState<ManualBook | null>(null);

  const availableYears = useMemo(() => {
    const base = selectedAwardTab === "all" ? entries : entries.filter((e) => e.award.name === selectedAwardTab);
    return [...new Set(base.map((e) => e.year))].sort((a, b) => b - a);
  }, [entries, selectedAwardTab]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => selectedAwardTab === "all" || e.award.name === selectedAwardTab)
      .filter((e) => selectedYear === "all" || e.year === selectedYear);
  }, [entries, selectedAwardTab, selectedYear]);

  useEffect(() => {
    adminFetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data));
  }, [adminFetch]);

  useEffect(() => {
    adminFetch("/api/admin/reported-reviews")
      .then((res) => res.json())
      .then((data: ReportedReview[]) => setReportedReviews(data));
  }, [adminFetch]);

  useEffect(() => {
    adminFetch("/api/admin/inquiries")
      .then((res) => res.json())
      .then((data: Inquiry[]) => setInquiries(data));
  }, [adminFetch]);

  useEffect(() => {
    adminFetch("/api/admin/users")
      .then((res) => res.json())
      .then((data: UserRow[]) => setUsers(data));
  }, [adminFetch]);

  useEffect(() => {
    adminFetch("/api/admin/follows")
      .then((res) => res.json())
      .then((data: { following: UserItem[]; followers: UserItem[] }) => setFollowsData(data));
  }, [followsRefreshKey, adminFetch]);

  useEffect(() => {
    adminFetch("/api/admin/follows/recommendations")
      .then((res) => res.json())
      .then((data: RecommendedUser[]) => setFollowRecommendations(data));
  }, [followsRefreshKey, adminFetch]);

  useEffect(() => {
    fetch("/api/user/secret-word")
      .then((res) => res.json())
      .then((data: { hasPasswordLogin: boolean; hasSecretWord: boolean }) => {
        setHasPasswordLogin(data.hasPasswordLogin);
        setHasSecretWord(data.hasSecretWord);
      });
  }, []);

  async function executeDeleteUser() {
    if (!deleteTargetUser) return;
    const target = deleteTargetUser;
    setDeletingUserId(target.id);
    setDeleteTargetUser(null);
    const res = await adminFetch(`/api/admin/users/${target.id}`, { method: "DELETE" });
    setDeletingUserId(null);
    if (!res.ok) {
      alert("ユーザーの削除に失敗しました。");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== target.id));
  }

  async function executeResetPassword() {
    if (!resetPasswordTargetUser) return;
    const target = resetPasswordTargetUser;
    setResettingPasswordUserId(target.id);
    setResetPasswordTargetUser(null);
    const res = await adminFetch(`/api/admin/users/${target.id}/reset-password`, { method: "POST" });
    setResettingPasswordUserId(null);
    if (!res.ok) {
      alert("パスワードのリセットに失敗しました。");
      return;
    }
    const data: { tempPassword: string } = await res.json();
    setTempPasswordCopied(false);
    setTempPasswordResult({ user: target, tempPassword: data.tempPassword });
  }

  async function executeChangeUserRole() {
    if (!roleChangeTargetUser) return;
    const target = roleChangeTargetUser;
    const newRole = target.role === "admin" ? "user" : "admin";
    setChangingRoleUserId(target.id);
    setRoleChangeTargetUser(null);
    const res = await adminFetch(`/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setChangingRoleUserId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "ロールの変更に失敗しました。");
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, role: newRole } : u))
    );
  }

  function handleDeleteReview(id: number) {
    setDeleteTargetReviewId(id);
  }

  async function executeDeleteReview() {
    if (deleteTargetReviewId === null) return;
    const targetId = deleteTargetReviewId;
    setDeletingReviewId(targetId);
    setDeleteTargetReviewId(null);
    const res = await adminFetch(`/api/admin/reviews/${targetId}`, { method: "DELETE" });
    setDeletingReviewId(null);
    if (!res.ok) {
      alert("レビューの削除に失敗しました。");
      return;
    }
    setReportedReviews((prev) => prev.filter((r) => r.id !== targetId));
  }

  async function handleToggleInquiryStatus(inquiry: Inquiry) {
    const newStatus = inquiry.status === "open" ? "closed" : "open";
    setUpdatingInquiryId(inquiry.id);
    const res = await adminFetch(`/api/admin/inquiries/${inquiry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdatingInquiryId(null);
    if (!res.ok) {
      alert("ステータスの更新に失敗しました。");
      return;
    }
    setInquiries((prev) =>
      prev.map((i) => (i.id === inquiry.id ? { ...i, status: newStatus } : i))
    );
    setSelectedInquiry((prev) => (prev?.id === inquiry.id ? { ...prev, status: newStatus } : prev));
  }

  async function executeDeleteInquiry() {
    if (!deleteTargetInquiry) return;
    const target = deleteTargetInquiry;
    setDeletingInquiryId(target.id);
    setDeleteTargetInquiry(null);
    const res = await adminFetch(`/api/admin/inquiries/${target.id}`, { method: "DELETE" });
    setDeletingInquiryId(null);
    if (!res.ok) {
      alert("削除に失敗しました。");
      return;
    }
    setInquiries((prev) => prev.filter((i) => i.id !== target.id));
  }

  useEffect(() => {
    adminFetch("/api/admin/award-entries")
      .then((res) => res.json())
      .then((data: AwardEntry[]) => setEntries(data));
  }, [refreshKey, adminFetch]);

  function refreshEntries() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    adminFetch("/api/admin/manual-books")
      .then((res) => res.json())
      .then((data: ManualBook[]) => setManualBooks(data));
  }, [manualBooksRefreshKey, adminFetch]);

  function refreshManualBooks() {
    setManualBooksRefreshKey((k) => k + 1);
  }

  function startManualBookEdit(book: ManualBook) {
    setEditingManualBookId(book.id);
    setEditingManualBookTitle(book.title);
    setEditingManualBookAuthor(book.author.name);
    setEditingManualBookIsbn(book.isbn ?? "");
  }

  function closeManualBookDetail() {
    setSelectedManualBookForDetail(null);
    setEditingManualBookId(null);
    setEditingManualBookTitle("");
    setEditingManualBookAuthor("");
    setEditingManualBookIsbn("");
  }

  async function saveManualBookEdit(id: number) {
    setManualBookSaving(true);
    const res = await adminFetch(`/api/admin/manual-books/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingManualBookTitle,
        author: editingManualBookAuthor,
        isbn: editingManualBookIsbn || null,
      }),
    });
    setManualBookSaving(false);
    if (!res.ok) return false;
    setEditingManualBookId(null);
    refreshManualBooks();
    return true;
  }

  async function saveManualBookEditFromDetail() {
    if (!selectedManualBookForDetail) return;
    const saved = await saveManualBookEdit(selectedManualBookForDetail.id);
    if (saved) closeManualBookDetail();
  }

  async function executeDeleteManualBook() {
    if (!deleteTargetManualBook) return;
    const target = deleteTargetManualBook;
    setDeletingManualBookId(target.id);
    setDeleteTargetManualBook(null);
    await adminFetch(`/api/admin/manual-books/${target.id}`, { method: "DELETE" });
    setDeletingManualBookId(null);
    refreshManualBooks();
  }

  async function handleMergeManualBooks() {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    setMerging(true);
    setMergeResult(null);
    const res = await adminFetch("/api/admin/manual-books/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceBookId: Number(mergeSourceId),
        targetBookId: Number(mergeTargetId),
      }),
    });
    if (res.ok) {
      setMergeResult("統合しました。");
      setMergeSourceId("");
      setMergeTargetId("");
      refreshManualBooks();
    } else {
      const data = await res.json();
      setMergeResult(`エラー: ${data.error ?? "統合に失敗しました。"}`);
    }
    setMerging(false);
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

    if (searchMode === "ndl") {
      const res = await adminFetch(`/api/admin/ndl-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const ndlItems: SearchResult[] = Array.isArray(data)
        ? data.map((b: { title: string; author: string; publisher: string; date: string; isbn: string; coverImageUrl: string | null }) => ({
            title: b.title,
            author: b.author,
            isbn: b.isbn,
            publisherName: b.publisher,
            salesDate: b.date,
            size: "",
            coverImageUrl: b.coverImageUrl ?? null,
          }))
        : [];
      setResults(ndlItems);
    } else {
      const res = await fetch(
        `/api/books/search?q=${encodeURIComponent(query)}&type=keyword&deduplicate=false`
      );
      const data = await res.json();
      setResults(Array.isArray(data.items) ? data.items : []);
    }

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
    setRegisterFormOpen(true);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setRegisterResult(null);
    const res = await adminFetch("/api/admin/award-entries", {
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

  function closeCsvImportModal() {
    if (importing || exporting) return;
    setCsvImportModalOpen(false);
    setCsvFile(null);
    setImportResult(null);
    setExportError(null);
  }

  async function handleImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await adminFetch("/api/admin/import-csv", { method: "POST", body: formData });
      const data = await res.json();
      setImportResult(data);
      refreshEntries();
    } catch {
      setImportResult({ success: 0, errors: ["インポートに失敗しました。"] });
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await adminFetch("/api/admin/award-entries/export");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setExportError(data?.error ?? "エクスポートに失敗しました。");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "award-entries.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("エクスポートに失敗しました。");
    } finally {
      setExporting(false);
    }
  }

  function handleDelete(id: number) {
    setDeleteTargetId(id);
  }

  async function handleDeleteConfirm() {
    if (deleteTargetId === null) return;
    setDeletingId(deleteTargetId);
    setDeleteTargetId(null);
    await adminFetch(`/api/admin/award-entries/${deleteTargetId}`, { method: "DELETE" });
    setDeletingId(null);
    refreshEntries();
  }

  function startEdit(entry: AwardEntry) {
    const editingBookIsbns = entry.book.bookIsbns.map((bookIsbn) => ({ ...bookIsbn }));
    if (entry.book.isbn && !editingBookIsbns.some((bookIsbn) => bookIsbn.isbn === entry.book.isbn)) {
      editingBookIsbns.push({
        isbn: entry.book.isbn,
        isPrimary: !editingBookIsbns.some((bookIsbn) => bookIsbn.isPrimary),
      });
    }

    setEditingId(entry.id);
    setEditingType(entry.type as "winner" | "nominee");
    setEditingYear(entry.year);
    setEditingTitle(entry.book.title);
    setEditingAuthor(entry.book.author.name);
    setEditingIsbns(editingBookIsbns);
    setEditingAwardId(entry.award.id);
    setEditError(null);
    setEditModalOpen(true);
  }

  function updateEditingIsbnValue(index: number, isbn: string) {
    setEditingIsbns((prev) => prev.map((item, i) => (i === index ? { ...item, isbn } : item)));
  }

  function setEditingIsbnPrimary(index: number) {
    setEditingIsbns((prev) => prev.map((item, i) => ({ ...item, isPrimary: i === index })));
  }

  function removeEditingIsbn(index: number) {
    setEditingIsbns((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((item) => item.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  function addEditingIsbn() {
    setEditingIsbns((prev) => [...prev, { isbn: "", isPrimary: prev.length === 0 }]);
  }

  async function handleEditSave(id: number) {
    setEditSaving(true);
    setEditError(null);
    const isbns = editingIsbns
      .map((item) => ({ isbn: item.isbn.trim(), isPrimary: item.isPrimary }))
      .filter((item) => item.isbn.length > 0);
    try {
      const response = await adminFetch(`/api/admin/award-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingTitle,
          author: editingAuthor,
          isbns,
          awardId: editingAwardId,
          year: editingYear,
          type: editingType,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        setEditError(data?.error ?? "受賞登録の更新に失敗しました。");
        return;
      }
      setEditingId(null);
      setEditModalOpen(false);
      refreshEntries();
    } catch {
      setEditError("通信エラーが発生しました。");
    } finally {
      setEditSaving(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const currentIndex = ADMIN_TABS.findIndex(({ key }) => key === activeTab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + ADMIN_TABS.length) % ADMIN_TABS.length;
    const nextTab = ADMIN_TABS[nextIndex].key;

    setActiveTab(nextTab);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <main className="flex flex-col px-4 py-6 lg:flex-1 lg:overflow-hidden lg:px-8 lg:py-8">
      <h1 className="mb-5 flex items-center gap-2 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
        <Settings className="h-6 w-6 lg:h-7 lg:w-7" />
        管理画面
      </h1>

      <div
        role="tablist"
        onKeyDown={handleTabKeyDown}
        className="mb-5 flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-700"
      >
        {ADMIN_TABS.map(({ key, label, icon: Icon }, index) => (
          <button
            key={key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`admin-tab-${key}`}
            aria-controls={`admin-tabpanel-${key}`}
            aria-selected={activeTab === key}
            tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setActiveTab(key)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors lg:px-4 ${
              activeTab === key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {activeTab === "audit" && (
          <div
            role="tabpanel"
            id="admin-tabpanel-audit"
            aria-labelledby="admin-tab-audit"
          >
            <AuditLogsView embedded />
          </div>
        )}

        {activeTab === "settings" && (
          <div
            role="tabpanel"
            id="admin-tabpanel-settings"
            aria-labelledby="admin-tab-settings"
          >
            {/* アカウント情報 */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle>
                  <span className="hidden items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:flex">
                    <Users className="h-4 w-4" />アカウント情報
                  </span>
                  <button
                    onClick={() => setAccountInfoOpen(!accountInfoOpen)}
                    className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:hidden"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />アカウント情報
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${accountInfoOpen ? "rotate-180" : ""}`} />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className={`${accountInfoOpen ? "" : "hidden"} lg:block`}>
                <AccountInfoCard
                  name={session?.user?.name ?? null}
                  email={session?.user?.email ?? null}
                  isAdmin={session?.user?.role === "admin"}
                />
              </CardContent>
            </Card>

            {/* フォロー */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle>
                  <span className="hidden items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:flex">
                    <Heart className="h-4 w-4" />フォロー
                  </span>
                  <button
                    onClick={() => setFollowsOpen(!followsOpen)}
                    className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:hidden"
                  >
                    <span className="flex items-center gap-2">
                      <Heart className="h-4 w-4" />フォロー
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${followsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className={`${followsOpen ? "" : "hidden"} lg:block`}>
                <FollowsTabs
                  following={followsData.following}
                  followers={followsData.followers}
                  recommendations={followRecommendations}
                  onFollowChange={() => setFollowsRefreshKey((k) => k + 1)}
                  viewAllHref="/settings/follows"
                />
              </CardContent>
            </Card>

            {/* 近隣図書館の設定 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>
                  <span className="hidden items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:flex">
                    <Library className="h-4 w-4" />近隣図書館の設定
                  </span>
                  <button
                    onClick={() => setNearbyLibrariesOpen(!nearbyLibrariesOpen)}
                    className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:hidden"
                  >
                    <span className="flex items-center gap-2">
                      <Library className="h-4 w-4" />近隣図書館の設定
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${nearbyLibrariesOpen ? "rotate-180" : ""}`} />
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className={`${nearbyLibrariesOpen ? "" : "hidden"} lg:block`}>
                <LibrarySettings />
              </CardContent>
            </Card>

            {/* 秘密の言葉 */}
            {hasPasswordLogin && (
              <Card className="mt-6">
                <CardHeader className="pb-3">
                  <CardTitle>
                    <span className="hidden items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:flex">
                      <KeyRound className="h-4 w-4" />秘密の言葉
                    </span>
                    <button
                      onClick={() => setSecretWordOpen(!secretWordOpen)}
                      className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:hidden"
                    >
                      <span className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4" />秘密の言葉
                      </span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${secretWordOpen ? "rotate-180" : ""}`} />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent className={`${secretWordOpen ? "" : "hidden"} lg:block`}>
                  <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                    パスワードを忘れた際の本人確認に使用します。設定しない場合、パスワードリセットは行えません。
                  </p>
                  <SecretWordForm isSet={hasSecretWord} />
                </CardContent>
              </Card>
            )}

            {/* このアプリについて */}
            <Link
              href="/about"
              className="mt-6 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                このアプリについて
              </span>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </Link>
          </div>
        )}

        {activeTab === "management" && (
        <div
          role="tabpanel"
          id="admin-tabpanel-management"
          aria-labelledby="admin-tab-management"
        >
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
            <CardTitle>
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" />書籍キーワードで検索
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${searchOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {searchOpen && <CardContent>
            {/* 検索モード切り替え */}
            <div className="mb-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { setSearchMode("rakuten"); setResults([]); }}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${searchMode === "rakuten" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}
              >
                楽天ブックス
              </button>
              <button
                type="button"
                onClick={() => { setSearchMode("ndl"); setResults([]); }}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${searchMode === "ndl" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}
              >
                国立国会図書館
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {searchMode === "rakuten"
                ? "楽天ブックスAPIから自動取得。スペース区切りで「タイトル 著者名」のようにAND検索で絞り込めます。"
                : "国立国会図書館APIから取得（絶版・旧版のISBNも検索可能）。表紙画像はありません。"}
            </p>
            <form onSubmit={handleSearch} className="mb-4 flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例: 容疑者Xの献身 東野圭吾（タイトル 著者名）"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <Button type="submit" disabled={searching} size="sm" className="shrink-0 whitespace-nowrap">
                {searching ? "検索中..." : "検索"}
              </Button>
            </form>

            {results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((book, i) => (
                  <li
                    key={`${book.isbn || ""}_${i}`}
                    className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-3">
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
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">{book.title}</p>
                        <p className="text-zinc-500 dark:text-zinc-400">{book.author}</p>
                        <p className="text-zinc-500 dark:text-zinc-400">{book.salesDate}</p>
                        {book.size && (
                          <p className="mt-1">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {book.size}
                            </span>
                          </p>
                        )}
                        {book.isbn && (
                          <p className="mt-1 text-xs text-zinc-400">ISBN: {book.isbn}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-end"
                      onClick={() => handleSelect(book)}
                    >
                      選択
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>}
        </Card>

        {/* 登録フォーム */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>
              <button
                onClick={() => setRegisterFormOpen(!registerFormOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />受賞作品登録
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${registerFormOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {registerFormOpen && <CardContent>
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
                  ISBN（任意）
                </label>
                <input
                  type="text"
                  value={form.isbn}
                  onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))}
                  placeholder="例: 9784167110119"
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
          </CardContent>}
        </Card>

        {/* CSVインポート（タイトルのみ、クリックでモーダル） */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <button
              onClick={() => setCsvImportModalOpen(true)}
              className="flex w-full items-center text-sm font-semibold uppercase tracking-widest text-muted-foreground"
            >
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4" />CSVから一括インポート
              </CardTitle>
            </button>
          </CardHeader>
        </Card>

        {/* 受賞登録一覧 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>
              <button
                onClick={() => setAwardsOpen(!awardsOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />受賞登録一覧
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${awardsOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {awardsOpen && <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">登録されていません。</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => { setSelectedAwardTab("all"); setSelectedYear("all"); }}
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
                        onClick={() => { setSelectedAwardTab(a.name); setSelectedYear("all"); }}
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
                <div className="mb-4 flex items-center gap-3">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value === "all" ? "all" : Number(e.target.value))}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <option value="all">すべての年度</option>
                    {availableYears.map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {filteredEntries.length}件
                  </span>
                </div>
              <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 lg:block">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="w-32 px-4 py-3 text-left">文学賞</th>
                      <th className="w-16 px-4 py-3 text-left">年度</th>
                      <th className="w-auto px-4 py-3 text-left">タイトル</th>
                      <th className="w-40 px-4 py-3 text-left">著者</th>
                      <th className="w-24 px-4 py-3 text-left">種別</th>
                      <th className="w-20 px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td
                          className="truncate px-4 py-3 text-zinc-700 dark:text-zinc-300"
                          title={entry.award.name}
                        >
                          {entry.award.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">{entry.year}年</td>
                        <td
                          className="cursor-pointer truncate px-4 py-3 text-zinc-900 hover:underline dark:text-zinc-50"
                          onClick={() => setSelectedAwardEntryForDetail(entry)}
                          title={entry.book.title}
                        >
                          {entry.book.title}
                        </td>
                        <td
                          className="truncate px-4 py-3 text-zinc-700 dark:text-zinc-300"
                          title={entry.book.author.name}
                        >
                          {entry.book.author.name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
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
                        <td className="whitespace-nowrap px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAwardEntryForDetail(entry)}
                          >
                            詳細
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル幅: カードリスト（タップで詳細モーダル） */}
              <ul className="flex flex-col gap-2 lg:hidden">
                {filteredEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAwardEntryForDetail(entry)}
                      className="flex w-full flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{entry.book.title}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {entry.award.name} ・ {entry.year}年
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )}
          </CardContent>}
        </Card>

        {/* 手動登録本の管理 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>
              <button
                onClick={() => setManualBooksOpen(!manualBooksOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />手動登録本の管理
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${manualBooksOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {manualBooksOpen && <CardContent>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              ユーザーが手動登録した本を確認・編集・削除・統合できます。登録された本の情報は管理者が管理します。
            </p>

            {manualBooks.length > 1 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">重複統合:</span>
                <select
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  <option value="">統合元を選択</option>
                  {manualBooks.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}（{b.author.name}）</option>
                  ))}
                </select>
                <span className="text-xs text-zinc-400">→</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  <option value="">統合先を選択</option>
                  {manualBooks.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}（{b.author.name}）</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || merging}
                  onClick={handleMergeManualBooks}
                >
                  {merging ? "統合中..." : "統合する"}
                </Button>
                {mergeResult && <span className="text-xs text-zinc-500">{mergeResult}</span>}
              </div>
            )}

            {manualBooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">手動登録された本はありません。</p>
            ) : (
              <>
              <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 lg:block">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 text-left">タイトル</th>
                      <th className="px-4 py-3 text-left">著者</th>
                      <th className="px-4 py-3 text-left">ISBN</th>
                      <th className="px-4 py-3 text-left">登録者</th>
                      <th className="px-4 py-3 text-left">利用状況</th>
                      <th className="px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                    {manualBooks.map((book) => (
                      <tr key={book.id}>
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">{book.title}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{book.author.name}</td>
                        <td className="px-4 py-3 text-zinc-500">{book.isbn ?? "-"}</td>
                        <td className="px-4 py-3 text-zinc-500">
                          {book.createdByUser ? `${book.createdByUser.name}（${book.createdByUser.email}）` : "不明"}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">
                          読書{book._count.readingStatuses}／レビュー{book._count.reviews}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" onClick={() => setSelectedManualBookForDetail(book)}>
                            詳細
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* モバイル幅: カードリスト（タップで詳細モーダル） */}
              <ul className="flex flex-col gap-2 lg:hidden">
                {manualBooks.map((book) => (
                  <li key={book.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedManualBookForDetail(book)}
                      className="flex w-full flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{book.title}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{book.author.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )}
          </CardContent>}
        </Card>

        {/* ユーザーロールの設定 */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>
              <button
                onClick={() => setUsersOpen(!usersOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />ユーザーロールの設定
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${usersOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {usersOpen && <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">ユーザーがいません。</p>
            ) : (
              <>
                {/* PC幅: 表形式 */}
                <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 lg:block">
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
                        const isAdmin = user.role === "admin";
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedUserForDetail(user)}
                              >
                                詳細
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* モバイル幅: カードリスト（タップで詳細モーダル） */}
                <ul className="flex flex-col gap-2 lg:hidden">
                  {users.map((user) => {
                    const isAdmin = user.role === "admin";
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedUserForDetail(user)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">{user.name}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              isAdmin
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {isAdmin ? "管理者" : "ユーザー"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>}
        </Card>

        {/* 通報されたレビュー */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>
              <button
                onClick={() => setReportedReviewsOpen(!reportedReviewsOpen)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-widest text-muted-foreground"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />通報されたレビュー
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${reportedReviewsOpen ? "rotate-180" : ""}`} />
              </button>
            </CardTitle>
          </CardHeader>
          {reportedReviewsOpen && <CardContent>
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
          </CardContent>}
        </Card>

        {/* お問い合わせ一覧 */}
        <Card>
          <CardHeader className="pb-3">
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setInquiriesOpen((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                <Mail className="h-4 w-4" />
                お問い合わせ
                {inquiries.filter((i) => i.status === "open").length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                    未対応 {inquiries.filter((i) => i.status === "open").length}件
                  </span>
                )}
              </CardTitle>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${inquiriesOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CardHeader>
          {inquiriesOpen && (
            <CardContent>
              {inquiries.length === 0 ? (
                <p className="text-sm text-muted-foreground">お問い合わせはありません。</p>
              ) : (
                <>
                <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 lg:block">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 text-left">受信日時</th>
                        <th className="px-4 py-3 text-left">カテゴリ</th>
                        <th className="px-4 py-3 text-left">件名</th>
                        <th className="px-4 py-3 text-left">送信者</th>
                        <th className="px-4 py-3 text-left">ステータス</th>
                        <th className="px-4 py-3 text-left">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                      {inquiries.map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">
                            {new Date(inquiry.createdAt).toLocaleDateString("ja-JP", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                            {CATEGORY_LABEL[inquiry.category] ?? inquiry.category}
                          </td>
                          <td className="max-w-48 px-4 py-3 text-zinc-700 dark:text-zinc-300 truncate">
                            <span title={inquiry.subject}>{inquiry.subject}</span>
                            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500 whitespace-normal line-clamp-2">
                              {inquiry.body}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300">{inquiry.name}</p>
                            <p className="text-xs text-zinc-400">{inquiry.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                inquiry.status === "open"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {inquiry.status === "open" ? "未対応" : "対応済み"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedInquiry(inquiry)}
                            >
                              詳細
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* モバイル幅: カードリスト（タップで詳細モーダル） */}
                <ul className="flex flex-col gap-2 lg:hidden">
                  {inquiries.map((inquiry) => (
                    <li key={inquiry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedInquiry(inquiry)}
                        className="flex w-full flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                            {inquiry.subject}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              inquiry.status === "open"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            {inquiry.status === "open" ? "未対応" : "対応済み"}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {inquiry.name} ・{" "}
                          {new Date(inquiry.createdAt).toLocaleDateString("ja-JP", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </CardContent>
          )}
        </Card>
        </div>
        )}

      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="受賞登録を削除しますか？"
        description="削除した受賞登録は元に戻せません。"
        confirmLabel="削除する"
        onConfirm={handleDeleteConfirm}
      />

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

      <ConfirmDialog
        open={roleChangeTargetUser !== null}
        onOpenChange={(open) => { if (!open) setRoleChangeTargetUser(null); }}
        title={
          roleChangeTargetUser?.role === "admin"
            ? "管理者権限を外しますか？"
            : "管理者にしますか？"
        }
        description={
          roleChangeTargetUser?.role === "admin"
            ? `「${roleChangeTargetUser?.name}」（${roleChangeTargetUser?.email}）の管理者権限を外し、一般ユーザーにします。`
            : `「${roleChangeTargetUser?.name}」（${roleChangeTargetUser?.email}）を管理者にします。管理画面へのアクセスなど強い権限を付与するため、信頼できる相手か確認してください。`
        }
        confirmLabel={roleChangeTargetUser?.role === "admin" ? "権限を外す" : "管理者にする"}
        onConfirm={executeChangeUserRole}
      />

      <ConfirmDialog
        open={resetPasswordTargetUser !== null}
        onOpenChange={(open) => { if (!open) setResetPasswordTargetUser(null); }}
        title="パスワードを強制リセットしますか？"
        description={`「${resetPasswordTargetUser?.name}」（${resetPasswordTargetUser?.email}）のパスワードを新しい一時パスワードに差し替えます。本人は次回ログイン後、必ず新しいパスワードへの変更を求められます。`}
        confirmLabel="リセットする"
        onConfirm={executeResetPassword}
      />

      <ConfirmDialog
        open={deleteTargetManualBook !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetManualBook(null); }}
        title="この本を削除しますか？"
        description={`「${deleteTargetManualBook?.title}」を削除します。この本に紐づくレビュー・読書ステータス・受賞登録も削除され、元に戻せません。`}
        confirmLabel="削除する"
        onConfirm={executeDeleteManualBook}
      />

      <ConfirmDialog
        open={deleteTargetInquiry !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetInquiry(null); }}
        title="お問い合わせを削除しますか？"
        description="削除したお問い合わせは元に戻せません。"
        confirmLabel="削除する"
        onConfirm={executeDeleteInquiry}
      />

      {/* ユーザーロール 詳細モーダル（モバイル用） */}
      {selectedUserForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedUserForDetail(null); }}
        >
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">ユーザー詳細</h2>
              <button
                onClick={() => setSelectedUserForDetail(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            {(() => {
              const user = selectedUserForDetail;
              const isMyself = currentUserId === user.id;
              const isAdmin = user.role === "admin";
              const canDelete = !isMyself && !isAdmin;
              return (
                <>
                  <dl className="flex flex-col gap-3 text-sm">
                    <div>
                      <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">名前</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">{user.name}</dd>
                    </div>
                    <div>
                      <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">メールアドレス</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">{user.email}</dd>
                    </div>
                    <div>
                      <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">ロール</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">{isAdmin ? "管理者" : "ユーザー"}</dd>
                    </div>
                    <div>
                      <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">登録日</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">
                        {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    {!isMyself && (
                      <Button
                        variant="outline"
                        onClick={() => { setRoleChangeTargetUser(user); setSelectedUserForDetail(null); }}
                        disabled={changingRoleUserId === user.id}
                      >
                        {isAdmin ? "管理者権限を外す" : "管理者にする"}
                      </Button>
                    )}
                    {!isMyself && (
                      <Button
                        variant="outline"
                        onClick={() => { setResetPasswordTargetUser(user); setSelectedUserForDetail(null); }}
                        disabled={resettingPasswordUserId === user.id}
                      >
                        <KeyRound className="mr-1 h-4 w-4" />パスワードを強制リセット
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="destructive"
                        onClick={() => { setDeleteTargetUser(user); setSelectedUserForDetail(null); }}
                        disabled={deletingUserId === user.id}
                      >
                        削除
                      </Button>
                    )}
                    <Button onClick={() => setSelectedUserForDetail(null)}>閉じる</Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 一時パスワード表示モーダル */}
      {tempPasswordResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
        >
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              一時パスワードを発行しました
            </h2>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              「{tempPasswordResult.user.name}」（{tempPasswordResult.user.email}）用の一時パスワードです。
              この画面を閉じると再表示できません。電話や社内チャットなど、メール以外の安全な方法で本人にお伝えください。
            </p>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
              <code className="flex-1 select-all break-all text-sm font-mono text-zinc-900 dark:text-zinc-50">
                {tempPasswordResult.tempPassword}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(tempPasswordResult.tempPassword);
                  setTempPasswordCopied(true);
                }}
                className="shrink-0 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                aria-label="コピー"
              >
                {tempPasswordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setTempPasswordResult(null)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}

      {/* CSVから一括インポート モーダル */}
      {csvImportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) closeCsvImportModal(); }}
        >
          <div className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">CSVから一括インポート</h2>
              <button
                onClick={closeCsvImportModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              フォーマット（ヘッダー行任意）: title, author, isbn, coverImageUrl, publishedAt, awardId, year, type
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ファイルを選択
                </Button>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {csvFile ? csvFile.name : "選択されていません"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleImport}
                  disabled={!csvFile || importing}
                  size="sm"
                >
                  {importing ? "インポート中..." : "インポート実行"}
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  variant="outline"
                  size="sm"
                >
                  <Download className="mr-1 h-4 w-4" />
                  {exporting ? "エクスポート中..." : "CSVエクスポート"}
                </Button>
              </div>
            </div>

            {exportError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{exportError}</p>
            )}

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

            <BookEnrichmentPanel adminFetch={adminFetch} />
          </div>
        </div>
      )}

      {/* 受賞登録 詳細モーダル（モバイル用） */}
      {selectedAwardEntryForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedAwardEntryForDetail(null); }}
        >
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">受賞登録の詳細</h2>
              <button
                onClick={() => setSelectedAwardEntryForDetail(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">タイトル</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{selectedAwardEntryForDetail.book.title}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">著者</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{selectedAwardEntryForDetail.book.author.name}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">ISBN</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {selectedAwardEntryForDetail.book.bookIsbns.length > 0 ? (
                    <ul className="flex flex-col gap-0.5">
                      {selectedAwardEntryForDetail.book.bookIsbns.map((bi) => (
                        <li key={bi.isbn}>
                          {bi.isbn}
                          {bi.isPrimary && (
                            <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              代表
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    selectedAwardEntryForDetail.book.isbn ?? "未登録"
                  )}
                </dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">文学賞</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{selectedAwardEntryForDetail.award.name}</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">年度</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{selectedAwardEntryForDetail.year}年</dd>
              </div>
              <div>
                <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">種別</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {selectedAwardEntryForDetail.type === "winner" ? "受賞作" : "ノミネート"}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { startEdit(selectedAwardEntryForDetail); setSelectedAwardEntryForDetail(null); }}
              >
                編集
              </Button>
              <Button
                variant="destructive"
                onClick={() => { handleDelete(selectedAwardEntryForDetail.id); setSelectedAwardEntryForDetail(null); }}
                disabled={deletingId === selectedAwardEntryForDetail.id}
              >
                削除
              </Button>
              <Button onClick={() => setSelectedAwardEntryForDetail(null)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}

      {/* 手動登録本 詳細モーダル（モバイル用） */}
      {selectedManualBookForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) closeManualBookDetail(); }}
        >
          <div className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">手動登録本の詳細</h2>
              <button
                onClick={closeManualBookDetail}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            {editingManualBookId === selectedManualBookForDetail.id ? (
              <>
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">タイトル</label>
                    <input
                      value={editingManualBookTitle}
                      onChange={(e) => setEditingManualBookTitle(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">著者</label>
                    <input
                      value={editingManualBookAuthor}
                      onChange={(e) => setEditingManualBookAuthor(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">ISBN</label>
                    <input
                      value={editingManualBookIsbn}
                      onChange={(e) => setEditingManualBookIsbn(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingManualBookId(null)}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={saveManualBookEditFromDetail}
                    disabled={manualBookSaving}
                  >
                    {manualBookSaving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <dl className="flex flex-col gap-3 text-sm">
                  <div>
                    <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">タイトル</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">{selectedManualBookForDetail.title}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">著者</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">{selectedManualBookForDetail.author.name}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">ISBN</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">{selectedManualBookForDetail.isbn ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">登録者</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">
                      {selectedManualBookForDetail.createdByUser
                        ? `${selectedManualBookForDetail.createdByUser.name}（${selectedManualBookForDetail.createdByUser.email}）`
                        : "不明"}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">利用状況</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">
                      読書{selectedManualBookForDetail._count.readingStatuses}／レビュー{selectedManualBookForDetail._count.reviews}
                    </dd>
                  </div>
                </dl>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => startManualBookEdit(selectedManualBookForDetail)}
                  >
                    編集
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => { setDeleteTargetManualBook(selectedManualBookForDetail); closeManualBookDetail(); }}
                    disabled={deletingManualBookId === selectedManualBookForDetail.id}
                  >
                    削除
                  </Button>
                  <Button onClick={closeManualBookDetail}>閉じる</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* お問い合わせ 詳細モーダル */}
      {selectedInquiry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedInquiry(null); }}
        >
          <div className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">お問い合わせ詳細</h2>
              <button
                onClick={() => setSelectedInquiry(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 text-sm">
              {/* ステータス＆受信日時 */}
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selectedInquiry.status === "open"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {selectedInquiry.status === "open" ? "未対応" : "対応済み"}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(selectedInquiry.createdAt).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* カテゴリ */}
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">カテゴリ</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {CATEGORY_LABEL[selectedInquiry.category] ?? selectedInquiry.category}
                </p>
              </div>

              {/* 件名 */}
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">件名</p>
                <p className="text-zinc-800 dark:text-zinc-200 font-medium">{selectedInquiry.subject}</p>
              </div>

              {/* 送信者情報 */}
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">送信者</p>
                <p className="text-zinc-800 dark:text-zinc-200">{selectedInquiry.name}</p>
                <p className="text-zinc-500 dark:text-zinc-400">{selectedInquiry.email}</p>
              </div>

              {/* 本文 */}
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">本文</p>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {selectedInquiry.body}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="destructive"
                onClick={() => { setDeleteTargetInquiry(selectedInquiry); setSelectedInquiry(null); }}
                disabled={deletingInquiryId === selectedInquiry.id}
              >
                削除
              </Button>
              <Button
                variant="outline"
                onClick={() => handleToggleInquiryStatus(selectedInquiry)}
                disabled={updatingInquiryId === selectedInquiry.id}
              >
                {selectedInquiry.status === "open" ? "対応済みにする" : "未対応に戻す"}
              </Button>
              <Button onClick={() => setSelectedInquiry(null)}>
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 受賞登録 編集モーダル */}
      {editModalOpen && editingId !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setEditModalOpen(false); }}
        >
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 pb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">受賞登録を編集</h2>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto px-6">
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
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">ISBN（任意・複数登録可）</label>
                <div className="flex flex-col gap-2">
                  {editingIsbns.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <input
                          type="radio"
                          name="editingIsbnPrimary"
                          checked={item.isPrimary}
                          onChange={() => setEditingIsbnPrimary(index)}
                        />
                        代表
                      </label>
                      <input
                        type="text"
                        value={item.isbn}
                        onChange={(e) => updateEditingIsbnValue(index, e.target.value)}
                        placeholder="例: 9784167110119"
                        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                      />
                      <button
                        type="button"
                        onClick={() => removeEditingIsbn(index)}
                        className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addEditingIsbn}
                    className="self-start text-xs font-medium text-zinc-600 hover:underline dark:text-zinc-400"
                  >
                    ＋ ISBNを追加
                  </button>
                </div>
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

            {editError && (
              <p role="alert" className="mx-6 mt-4 text-sm text-red-600 dark:text-red-400">
                {editError}
              </p>
            )}
            <div className="mt-6 flex shrink-0 justify-end gap-2 border-t border-zinc-200 p-6 pt-4 dark:border-zinc-800">
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
