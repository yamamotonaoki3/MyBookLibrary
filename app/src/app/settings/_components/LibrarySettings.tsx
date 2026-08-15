"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Library, X, Search } from "lucide-react";

type UserLibrary = {
  id: number;
  systemid: string;
  libkey: string;
  name: string;
  pref: string;
  city: string | null;
};

type SearchedLibrary = {
  systemid: string;
  systemname: string;
  libkey: string;
  formal: string;
  pref: string;
  city: string;
};

const PREFS = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export function LibrarySettings() {
  const [registered, setRegistered] = useState<UserLibrary[]>([]);
  const [pref, setPref] = useState("");
  const [city, setCity] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchedLibrary[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user-libraries")
      .then((r) => r.json())
      .then((data: UserLibrary[]) => setRegistered(data));
  }, []);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pref) return;
    setSearching(true);
    setSearchResults([]);
    setMessage(null);
    const params = new URLSearchParams({ pref, ...(city ? { city } : {}) });
    const res = await fetch(`/api/calil/libraries?${params}`);
    if (!res.ok) {
      setMessage("図書館の検索に失敗しました");
      setSearching(false);
      return;
    }
    const data: SearchedLibrary[] = await res.json();
    setSearchResults(data);
    if (data.length === 0) setMessage("図書館が見つかりませんでした");
    setSearching(false);
  }

  async function handleAdd(lib: SearchedLibrary) {
    setAdding(lib.systemid);
    setMessage(null);
    const res = await fetch("/api/user-libraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemid: lib.systemid,
        libkey: lib.libkey ?? "",
        name: lib.formal || lib.systemname,
        pref: lib.pref,
        city: lib.city,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error ?? "登録に失敗しました");
      setAdding(null);
      return;
    }
    const created: UserLibrary = await res.json();
    setRegistered((prev) => [...prev, created]);
    setMessage(`「${lib.systemname}」を登録しました`);
    setAdding(null);
  }

  async function handleDelete(lib: UserLibrary) {
    setDeleting(lib.systemid);
    await fetch(`/api/user-libraries?systemid=${encodeURIComponent(lib.systemid)}&libkey=${encodeURIComponent(lib.libkey)}`, {
      method: "DELETE",
    });
    setRegistered((prev) => prev.filter((l) => l.systemid !== lib.systemid));
    setDeleting(null);
  }

  const registeredKeys = new Set(registered.map((l) => `${l.systemid}__${l.libkey}`));

  return (
    <div className="flex flex-col gap-4">
      {/* 登録済み図書館 */}
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          登録済みの図書館（最大5館）
        </p>
        {registered.length === 0 ? (
          <p className="text-sm text-zinc-400">まだ登録されていません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {registered.map((lib) => (
              <li
                key={lib.systemid}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Library className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{lib.name}</span>
                  <span className="text-xs text-zinc-400">
                    {lib.pref}{lib.city ? ` ${lib.city}` : ""}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(lib)}
                  disabled={deleting === lib.systemid}
                  className="text-zinc-400 hover:text-red-500 disabled:opacity-50"
                  aria-label="削除"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 図書館を検索して追加 */}
      {registered.length < 5 && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            図書館を検索して追加
          </p>
          <form onSubmit={handleSearch} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={pref}
                onChange={(e) => setPref(e.target.value)}
                required
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                <option value="">都道府県を選択</option>
                {PREFS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="市区町村（任意）"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>
            <Button type="submit" disabled={!pref || searching} size="sm" className="self-start">
              <Search className="mr-1 h-3.5 w-3.5" />
              {searching ? "検索中..." : "図書館を検索"}
            </Button>
          </form>

          {message && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          )}

          {searchResults.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {searchResults.map((lib) => (
                <li
                  key={`${lib.systemid}__${lib.libkey}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="text-sm">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{lib.formal || lib.systemname}</span>
                    <span className="ml-2 text-xs text-zinc-400">{lib.city}</span>
                  </div>
                  {registeredKeys.has(`${lib.systemid}__${lib.libkey ?? ""}`) ? (
                    <span className="text-xs text-zinc-400">登録済み</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(lib)}
                      disabled={adding === lib.systemid}
                      className="shrink-0"
                    >
                      {adding === lib.systemid ? "登録中..." : "追加"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {searchResults.length > 0 && (
            <a
              href="https://calil.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[10px] text-zinc-400 hover:underline dark:text-zinc-500"
            >
              図書館情報提供：カーリル
            </a>
          )}
        </div>
      )}
    </div>
  );
}
