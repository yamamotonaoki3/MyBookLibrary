import { test, expect } from "@playwright/test";
import { resetDb, testPrisma } from "../src/__tests__/helpers/dbTest";
import { seedE2e } from "../prisma/seed.e2e";
import { loginAsAdmin } from "./fixtures/auth";

// .env.testを明示してENRICHMENT_MODE=cronで専用実行する。実DB・実APIは禁止。
test.describe("書誌補完 Cron API", () => {
  test.skip(process.env.ENRICHMENT_MODE !== "cron", "専用のcronモード実行が必要");
  test("startは処理を予約し、Cookieなしのtickで完了する", async ({ page, request }) => {
    test.setTimeout(5 * 60_000);
    const secret = process.env.ENRICHMENT_TICK_SECRET;
    expect(secret && secret.length >= 16).toBeTruthy();
    await resetDb();
    await seedE2e();
    const bookCount = 3;
    await testPrisma.author.create({
      data: {
        name: "[E2E_TEST] 補完テスト用の架空著者",
        books: {
          create: Array.from({ length: bookCount }, (_, i) => ({
            title: `[E2E_TEST] 補完テスト用の架空書籍 ${i + 1}`,
            isbn: null,
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
          })),
        },
      },
    });
    await loginAsAdmin(page);
    const start = await page.request.post("/api/admin/book-enrichment/start");
    expect(start.status()).toBe(200);
    const { jobId } = await start.json();
    const queued = await testPrisma.bookEnrichmentJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(queued.status).toBe("running");
    expect(queued.doneCount).toBe(0);
    expect(queued.totalCount).toBe(bookCount);
    // request は page の管理者 Cookie を共有しない独立したコンテキスト。
    expect((await request.storageState()).cookies).toEqual([]);
    expect((await request.get("/api/admin/book-enrichment/tick", { maxRedirects: 0 })).status()).toBe(401);
    // 1回で全件終わる保証はない。各tickが処理後に応答し、DB進捗が保存されることを確認する。
    for (let i = 0; i < 10; i++) {
      const tick = await request.get("/api/admin/book-enrichment/tick", {
        maxRedirects: 0,
        headers: { authorization: `Bearer ${secret}` }, timeout: 60_000,
      });
      expect(tick.status()).toBe(200);
      expect((await tick.json()).processed).toContain(jobId);
      const job = await testPrisma.bookEnrichmentJob.findUniqueOrThrow({ where: { id: jobId } });
      if (job.status === "completed") {
        expect(job.doneCount).toBe(job.totalCount);
        const items = await testPrisma.bookEnrichmentItem.findMany({ where: { jobId } });
        expect(items).toHaveLength(bookCount);
        expect(items.every((item) => item.status === "done" || item.status === "error")).toBe(true);
        const idleTick = await request.get("/api/admin/book-enrichment/tick", {
          maxRedirects: 0,
          headers: { authorization: `Bearer ${secret}` },
        });
        expect(idleTick.status()).toBe(200);
        expect((await idleTick.json()).processed).toEqual([]);
        return;
      }
      expect(job.status).toBe("running");
    }
    throw new Error("テスト用ジョブが10回のtickで完了しませんでした");
  });
});
