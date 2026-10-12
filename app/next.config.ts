import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request }: { request: Request }) =>
          request.mode === "navigate",
        handler: "NetworkOnly" as const,
      },
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/api/auth/"),
        handler: "NetworkOnly" as const,
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  turbopack: {},
  images: {
    // Next.js の画像最適化（sharp）に依存しない。Cloudflare Workers では動かせないため、
    // 書影は外部の URL（楽天等）をそのまま <img> で表示する（docs/cloudflare-d1-migration-plan.md §3）。
    unoptimized: true,
  },
};

export default withPWA(nextConfig);
