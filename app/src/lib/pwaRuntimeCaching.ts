import type { RuntimeCaching } from "workbox-build";

// Workbox serializes these callbacks into sw.js: do not capture module variables.
// Personal responses always go to the network. Unmatched requests use Workbox's
// normal network fallback; only the explicitly public paths below opt into cache.
export const pwaRuntimeCaching: RuntimeCaching[] = [
  {
    urlPattern: ({ request, url }) => url.origin === self.location.origin && (
      request.mode === "navigate" ||
      url.pathname === "/api" || url.pathname.startsWith("/api/") ||
      request.headers.has("RSC") || url.searchParams.has("_rsc") ||
      url.pathname.startsWith("/_next/data/")
    ),
    handler: "NetworkOnly",
  },
  {
    urlPattern: ({ url }) => url.origin === self.location.origin && (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/icon.png" || url.pathname === "/manifest.json"
    ),
    handler: "CacheFirst",
    options: {
      cacheName: "mbl-public-assets-v1",
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
];
