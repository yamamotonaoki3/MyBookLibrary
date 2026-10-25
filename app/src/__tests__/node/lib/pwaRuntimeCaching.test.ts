import { runInNewContext } from "node:vm";
import { pwaRuntimeCaching } from "@/lib/pwaRuntimeCaching";

// Workbox stringifies callbacks into a separate SW context. This catches captured
// module variables as well as overly broad rules that cache personal responses.
function handler(path: string, headers: Record<string, string> = {}, navigate = false) {
  const url = new URL(path, "https://library.example.com");
  const request = new Request(url, { headers });
  if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
  const input = { url, request, sameOrigin: url.origin === "https://library.example.com" };
  return pwaRuntimeCaching.find(({ urlPattern }) => {
    if (typeof urlPattern !== "function") throw new Error("Expected a self-contained match callback");
    return runInNewContext(`(${urlPattern.toString()})(input)`, {
      input, self: { location: { origin: "https://library.example.com" } },
    });
  })?.handler;
}

describe("serialized PWA cache boundary", () => {
  it.each([
    ["/", {}, true],
    ["/books", {}, true],
    ["/api/auth/session", {}, false],
    ["/api/notifications", {}, false],
    ["/api", {}, false],
    ["/api/private.png", {}, false],
    ["/books?_rsc=123", {}, false],
    ["/books", { RSC: "1" }, false],
    ["/_next/static/chunk.js", { RSC: "1" }, false],
    ["/icons/icon-192.png?_rsc=123", {}, false],
    ["/_next/data/build/books.json", {}, false],
  ] as const)("protects %s before any public asset rule", (path, headers, navigate) => {
    expect(handler(path, headers, navigate)).toBe("NetworkOnly");
  });
  it.each(["/_next/static/chunks/app.js", "/icons/icon-192.png", "/icon.png", "/manifest.json"])(
    "allows the public asset %s offline", (path) => expect(handler(path)).toBe("CacheFirst"),
  );
  it.each([
    "/books/private.png", "/api-like/private.json", "/icons-private/private.png",
    "/icon.png/private", "/_next/static-private/chunk.js", "/manifest.json/private",
    "https://other.example.com/icons/icon-192.png", "https://other.example.com/api/auth/session",
  ])("does not opt arbitrary or cross-origin data into a cache: %s", (path) => {
    expect(handler(path)).toBeUndefined();
  });
});
