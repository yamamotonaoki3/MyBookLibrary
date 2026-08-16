"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AUDIT_EVENT_LABEL, type AuditEventType } from "@/lib/auditEvents";
import { useAdminFetch } from "@/lib/adminFetch";

type AuditLogRow = {
  id: number;
  eventType: string;
  actorUserId: number | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: number | null;
  detail: unknown;
  ipAddress: string | null;
  createdAt: string;
  actorUser: { id: number; name: string; email: string } | null;
};

type AuditLogResponse = {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

export function AuditLogsView({ embedded = false }: { embedded?: boolean } = {}) {
  const adminFetch = useAdminFetch();
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const applyResponse = useCallback((data: AuditLogResponse) => {
    setItems(data.items);
    setTotal(data.total);
    setPage(data.page);
  }, []);

  // ページング・フィルタ操作（イベントハンドラ）から呼ぶ取得関数
  const fetchLogs = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
        if (eventType) params.set("eventType", eventType);
        if (actorUserId) params.set("actorUserId", actorUserId);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await adminFetch(`/api/admin/audit-logs?${params}`);
        if (res.ok) {
          const data: AuditLogResponse = await res.json();
          applyResponse(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [eventType, actorUserId, from, to, applyResponse, adminFetch]
  );

  // 初回ロードのみ：エフェクト内でのsetStateはPromiseコールバック経由にする
  useEffect(() => {
    adminFetch(`/api/admin/audit-logs?page=1&pageSize=${PAGE_SIZE}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<AuditLogResponse>;
      })
      .then((data) => {
        if (data) applyResponse(data);
      })
      .finally(() => setLoading(false));
  }, [applyResponse, adminFetch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <main className={embedded ? "flex flex-col" : "flex flex-col px-4 py-6 lg:px-8 lg:py-8"}>
      {!embedded && (
        <>
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold tracking-tight lg:text-3xl">
            <ScrollText className="h-6 w-6 lg:h-7 lg:w-7" />
            監査ログ
          </h1>

          <Link href="/admin" className="mb-6 text-sm text-blue-600 hover:underline dark:text-blue-400">
            ← 管理画面に戻る
          </Link>
        </>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            フィルタ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">イベント種別</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">すべて</option>
                {Object.entries(AUDIT_EVENT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">実行者ユーザーID</label>
              <input
                type="number"
                value={actorUserId}
                onChange={(e) => setActorUserId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:w-28"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">開始日</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">終了日</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <Button size="sm" onClick={() => fetchLogs(1)} disabled={loading} className="col-span-2 sm:col-span-1">
              絞り込む
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">監査ログがありません。</p>
          ) : (
            <>
              {/* PC幅: 表形式 */}
              <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 lg:block">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 text-left">日時</th>
                      <th className="px-4 py-3 text-left">イベント</th>
                      <th className="px-4 py-3 text-left">実行者</th>
                      <th className="px-4 py-3 text-left">対象</th>
                      <th className="px-4 py-3 text-left">IPアドレス</th>
                      <th className="px-4 py-3 text-left">詳細</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {new Date(item.createdAt).toLocaleString("ja-JP", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                          {AUDIT_EVENT_LABEL[item.eventType as AuditEventType] ?? item.eventType}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {item.actorUser?.name ?? item.actorEmail ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {item.targetType ? `${item.targetType} #${item.targetId}` : "-"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {item.ipAddress ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
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
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="flex w-full flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {AUDIT_EVENT_LABEL[item.eventType as AuditEventType] ?? item.eventType}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(item.createdAt).toLocaleString("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" ・ "}
                        {item.actorUser?.name ?? item.actorEmail ?? "-"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                <span>
                  全{total}件中 {start}-{end}件
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() => fetchLogs(page - 1)}
                  >
                    前へ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages || loading}
                    onClick={() => fetchLogs(page + 1)}
                  >
                    次へ
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">監査ログ詳細</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">日時</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {new Date(selected.createdAt).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">イベント</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {AUDIT_EVENT_LABEL[selected.eventType as AuditEventType] ?? selected.eventType}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">実行者</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {selected.actorUser?.name ?? "-"}
                  {selected.actorEmail && ` (${selected.actorEmail})`}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">対象</p>
                <p className="text-zinc-800 dark:text-zinc-200">
                  {selected.targetType ? `${selected.targetType} #${selected.targetId}` : "-"}
                </p>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">IPアドレス</p>
                <p className="text-zinc-800 dark:text-zinc-200">{selected.ipAddress ?? "-"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">詳細情報</p>
                <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {JSON.stringify(selected.detail, null, 2)}
                </pre>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setSelected(null)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
