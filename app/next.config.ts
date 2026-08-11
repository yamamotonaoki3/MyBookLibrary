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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      // E2E（#435）でのみ設定される。ローカルのスタブサーバーが返す書影URLを
      // next/image が最適化できるようにする。本番・開発では STUB_SERVER_PORT を
      // 設定しないため、この項目は追加されない。
      ...(process.env.STUB_SERVER_PORT
        ? [
            {
              protocol: "http" as const,
              hostname: "localhost",
              port: process.env.STUB_SERVER_PORT,
            },
          ]
        : []),
    ],
    // Next.js 16 の既定では、画像URLの解決先がプライベートIPだと
    // SSRF対策でブロックされる。E2Eのスタブサーバー（localhost）向けの
    // 書影のみ、STUB_SERVER_PORT が設定されているときに限って許可する。
    dangerouslyAllowLocalIP: !!process.env.STUB_SERVER_PORT,
  },
};

export default withPWA(nextConfig);
