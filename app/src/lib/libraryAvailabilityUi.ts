// 貸出状況に応じたバッジスタイル
export function getLoanStatusStyle(status: string): string {
  switch (status) {
    case "貸出可":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "蔵書あり":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "館内のみ":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "貸出中":
    case "予約中":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "準備中":
    case "休館中":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "蔵書なし":
      return "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500";
    default:
      return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

// 予約リンクを表示するかどうか（蔵書がある状態のみ）
export function showReserveLink(status: string): boolean {
  return ["貸出可", "蔵書あり", "館内のみ", "貸出中", "予約中", "準備中"].includes(status);
}
