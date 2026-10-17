"use client";

import { useCallback, useState } from "react";

/**
 * 管理画面のデータ読み込み。成功したときだけ画面のデータに反映し、失敗（HTTP エラー・通信失敗・JSON の解析失敗）は
 * `failedLoads` に覚える。失敗した応答（`{ error }`）を一覧のデータとして使うと、画面全体が落ちるため（#744）。
 * 同じものを再び読み込んで成功すれば、失敗の表示は消える。
 */
export function useAdminLoad(fetcher: (url: string) => Promise<Response>) {
  const [failedLoads, setFailedLoads] = useState<string[]>([]);

  const load = useCallback(
    async <T,>(url: string, label: string, apply: (data: T) => void): Promise<void> => {
      try {
        const res = await fetcher(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        apply(data);
        setFailedLoads((prev) => prev.filter((l) => l !== label));
      } catch {
        setFailedLoads((prev) => (prev.includes(label) ? prev : [...prev, label]));
      }
    },
    [fetcher]
  );

  return { failedLoads, load };
}
