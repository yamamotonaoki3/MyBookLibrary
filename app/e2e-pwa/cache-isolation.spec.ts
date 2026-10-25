import { test, expect, type Page } from "@playwright/test";
import { seedE2e, E2E_USER, E2E_ADMIN } from "../prisma/seed.e2e";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { login, loginAsAdmin, logout } from "../e2e/fixtures/auth";

const markerA = "[E2E_TEST] private-reading-user-a";
const markerB = "[E2E_TEST] private-reading-user-b";
const legacyCaches = ["start-url", "apis", "pages", "pages-rsc", "pages-rsc-prefetch", "next-data", "static-data-assets", "cross-origin"];

test.beforeEach(async () => {
  await resetDb();
  await seedE2e();
  const author = await testPrisma.author.create({ data: { name: "[E2E_TEST] PWA author" } });
  for (const [email, title] of [[E2E_USER.email, markerA], [E2E_ADMIN.email, markerB]]) {
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    const book = await testPrisma.book.create({ data: { title, authorId: author.id, publishedAt: new Date("2020-01-01") } });
    await testPrisma.readingStatus.create({ data: { userId: user.id, bookId: book.id, status: "reading" } });
  }
});

async function controlled(page: Page) {
  const script = await page.request.get("/sw.js", { maxRedirects: 0 });
  expect(script.status(), "SW must be directly accessible, including before login").toBe(200);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    }
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("/sw.js");
}

async function cacheInventory(page: Page) {
  return page.evaluate(async () => {
    const entries: { cache: string; url: string; body: string }[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const type = response?.headers.get("content-type") ?? "";
        entries.push({ cache: name, url: request.url, body: /text|json|javascript/.test(type) ? await response!.text() : "" });
      }
    }
    return entries;
  });
}

test("production SW keeps HTML, RSC and APIs private across logout and user switch", async ({ page, context }) => {
  await login(page);
  await controlled(page);
  await page.goto("/books");
  await expect(page.getByRole("link", { name: markerA, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: markerB, exact: true })).toHaveCount(0);
  const results = await page.evaluate(async () => {
    const session = await fetch("/api/auth/session");
    const notifications = await fetch("/api/notifications");
    const rsc = await fetch("/books?_rsc=pwa-test-a", { headers: { RSC: "1" } });
    return { session: await session.json(), apiStatus: notifications.status, rscStatus: rsc.status, rscType: rsc.headers.get("content-type"), rsc: await rsc.text() };
  });
  expect(results.session.user.email).toBe(E2E_USER.email);
  expect(results.apiStatus).toBe(200);
  expect(results.rscStatus).toBe(200);
  expect(results.rscType).toContain("text/x-component");
  expect(results.rsc).toContain(markerA);

  await logout(page);
  await loginAsAdmin(page);
  await page.goto("/books");
  await expect(page.getByRole("link", { name: markerB, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: markerA, exact: true })).toHaveCount(0);
  const sessionB = await page.evaluate(() => fetch("/api/auth/session").then((response) => response.json()));
  expect(sessionB.user.email).toBe(E2E_ADMIN.email);

  // Fetch a real public asset before going offline; use SW (disable HTTP cache).
  expect(await page.evaluate(() => fetch("/icons/icon-192.png").then((response) => response.ok))).toBe(true);
  await context.setOffline(true);
  const offline = await page.evaluate(async () => {
    async function succeeds(url: string, headers?: Record<string, string>) {
      try { return (await fetch(url, { headers, cache: "no-store" })).ok; } catch { return false; }
    }
    return {
      html: await succeeds("/books"),
      session: await succeeds("/api/auth/session"),
      api: await succeeds("/api/notifications"),
      rsc: await succeeds("/books?_rsc=pwa-test-a", { RSC: "1" }),
      icon: await succeeds("/icons/icon-192.png"),
    };
  });
  expect(offline).toEqual({ html: false, session: false, api: false, rsc: false, icon: true });
  const inventory = await cacheInventory(page);
  expect(inventory.length).toBeGreaterThan(0);
  expect(inventory.filter(({ url }) => {
    const path = new URL(url).pathname;
    return path === "/" || path === "/books" || path.startsWith("/api/") || path.startsWith("/_next/data/");
  })).toEqual([]);
  const text = JSON.stringify(inventory);
  for (const marker of [markerA, markerB, E2E_USER.email, E2E_ADMIN.email]) expect(text).not.toContain(marker);
  await expect(page.goto("/books")).rejects.toThrow();
  await context.setOffline(false);
});

test("activation removes known legacy personal caches and preserves unrelated caches", async ({ page }) => {
  // JSON document does not execute the automatic app SW registration.
  await page.goto("/manifest.json");
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((all) => all.length))).toBe(0);
  await page.evaluate(async ({ names, marker }) => {
    for (const name of [...names, "unrelated-app-cache"]) {
      await (await caches.open(name)).put("/books", new Response(marker));
    }
    await navigator.serviceWorker.register("/sw.js");
  }, { names: legacyCaches, marker: markerA });
  await controlled(page);
  const names = await page.evaluate(() => caches.keys());
  for (const name of legacyCaches) expect(names).not.toContain(name);
  expect(names).toContain("unrelated-app-cache");
  expect(await page.evaluate(async () => (await (await caches.open("unrelated-app-cache")).match("/books"))?.text())).toBe(markerA);
});
