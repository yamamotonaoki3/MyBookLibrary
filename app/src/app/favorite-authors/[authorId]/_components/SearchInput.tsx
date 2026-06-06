"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentQuery = searchParams.get("q") ?? "";

  function submit() {
    const value = inputRef.current?.value.trim() ?? "";
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          defaultValue={currentQuery}
          placeholder="タイトルを漢字で入力（例：容疑者Xの献身）"
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {currentQuery && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="クリア"
          >
            ✕
          </button>
        )}
      </div>
      <button
        onClick={submit}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
      >
        検索
      </button>
    </div>
  );
}
