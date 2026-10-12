import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Cloudflare Workers 向けのビルド設定（npm run build:worker）。キャッシュ等の追加バインディングなしの最小構成。
const config = {
  ...defineCloudflareConfig({}),
  // 本番ビルドと同じ webpack ビルド（@ducanh2912/next-pwa のため）を使う。
  // DB_PROVIDER=d1 / D1_RUNTIME=workers は scripts/build-worker.mjs が環境変数で渡す。
  buildCommand: "npm run build",
};

export default config;
