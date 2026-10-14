import { connection } from "next/server";
import { isDemoMode } from "@/lib/demoMode";

/**
 * デモ環境（DEMO_MODE=true）の注意書き。ページの上部に、通常の流れで置く（入力欄などに重ならないようにするため、固定配置にしない）。
 * 環境変数は実行時に読む（ビルド時の静的な出力に、固定されないようにするため）。
 * variant: "auth" はログイン・登録の画面（カードと同じ幅）、"app" はログイン後の画面（本文の幅）。
 */
export async function DemoBanner({ variant }: { variant: "auth" | "app" }) {
  await connection();
  if (!isDemoMode()) return null;
  const width = variant === "auth" ? "w-full max-w-sm lg:max-w-lg" : "mx-4 mt-3 lg:mx-8";
  return (
    <div
      role="status"
      data-testid="demo-banner"
      className={`${width} shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900`}
    >
      デモ環境です。個人情報は入力しないでください。データは予告なく初期化されます。
    </div>
  );
}
