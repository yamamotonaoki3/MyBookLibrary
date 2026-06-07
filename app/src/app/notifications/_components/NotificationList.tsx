"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Notification = {
  id: number;
  type: string;
  content: string;
  bookIsbn: string | null;
  isRead: boolean;
  createdAt: string;
};

type Props = {
  initialNotifications: Notification[];
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function NotificationIcon({ type }: { type: string }) {
  if (type === "like") return <span className="text-xl">♡</span>;
  return <span className="text-xl">📚</span>;
}

function TypeBadge({ type }: { type: string }) {
  if (type === "like") {
    return (
      <span className="rounded bg-pink-100 px-1.5 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
        いいね
      </span>
    );
  }
  return (
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      新刊
    </span>
  );
}

export function NotificationList({ initialNotifications }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleReadAll() {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  async function handleClick(notification: Notification) {
    if (!notification.isRead) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
    }
    if (notification.bookIsbn) {
      router.push(`/books/isbn/${notification.bookIsbn}`);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="mb-5 shrink-0 text-2xl font-bold tracking-tight lg:mb-6 lg:text-3xl">
          🔔 通知
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={handleReadAll}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            すべて既読にする
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">
          通知はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              onClick={() => handleClick(notification)}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                notification.isRead
                  ? "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  : "border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
              }`}
            >
              <div className="flex-shrink-0 pt-0.5">
                <NotificationIcon type={notification.type} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <TypeBadge type={notification.type} />
                  {!notification.isRead && (
                    <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      未読
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">
                  {notification.content}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatDate(notification.createdAt)}
                  </span>
                  {notification.isRead && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      既読
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
