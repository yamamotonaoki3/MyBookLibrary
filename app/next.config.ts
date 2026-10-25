import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { version as appVersion } from "./package.json";
import { pwaRuntimeCaching } from "./src/lib/pwaRuntimeCaching";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: false,
  dynamicStartUrl: false,
  extendDefaultRuntimeCaching: false,
  customWorkerSrc: "pwa-worker",
  customWorkerPrefix: "pwa-worker",
  // Only webpack's immutable chunks are precached. Public assets opt into the
  // explicit runtime allowlist; do not precache arbitrary future public files.
  publicExcludes: ["!**/*"],
  workboxOptions: {
    runtimeCaching: pwaRuntimeCaching,
  },
});

const nextConfig: NextConfig = {
  // 接続先の DB（mysql / d1）をビルド時に埋め込む。使わない側の実装はバンドルから除かれる（src/lib/prisma.ts）。
  env: {
    DB_PROVIDER: process.env.DB_PROVIDER ?? "mysql",
    D1_RUNTIME: process.env.D1_RUNTIME ?? "workers",
    // アプリのバージョン（package.json の version）。GET /api/version で返す。
    APP_VERSION: appVersion,
  },
  output: "standalone",
  // D1 向け（Cloudflare Workers）のビルドでは、Prisma の wasm を webpack に処理させず、実行時の ESM import として
  // そのまま残す。wrangler が CompiledWasm として同梱する（import 先の書き換えと wasm のコピーは
  // scripts/build-worker.mjs。webpack に処理させると `fs` で読む形に変換され、Workers で失敗する）。
  webpack: (config) => {
    if (process.env.DB_PROVIDER === "d1") {
      const previous = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(previous) ? previous : [previous]),
        ({ request }: { request?: string }, callback: (error?: Error | null, result?: string) => void) =>
          request?.endsWith(".wasm") ? callback(null, "module ./query_compiler_bg.wasm") : callback(),
      ];
    }
    return config;
  },
  devIndicators: false,
  turbopack: {},
  images: {
    // Next.js の画像最適化（sharp）に依存しない。Cloudflare Workers では動かせないため、
    // 書影は外部の URL（楽天等）をそのまま <img> で表示する（docs/archive/cloudflare-d1-migration-plan.md §3）。
    unoptimized: true,
  },
};

export default withPWA(nextConfig);
