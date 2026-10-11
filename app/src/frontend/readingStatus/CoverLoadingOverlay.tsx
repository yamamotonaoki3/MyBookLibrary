import { Loader2 } from "lucide-react";

/**
 * 書影の上に重ねる読み込み中表示。親要素を `relative` にして使う。
 * 本の登録・取得中（未登録の本の詳細へ移動する間など）に表示する。
 */
export function CoverLoadingOverlay() {
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded bg-white/60 dark:bg-black/50">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-700 dark:text-zinc-200" aria-hidden="true" />
    </span>
  );
}
