/**
 * データ移行（ETL）のテスト用の、架空データ。MySQL・D1 のどちらにも、同じ内容を作れる。
 * 実在の個人・メールアドレスは使わない（`@example.com`、`[E2E_TEST]`、`testuser_*`）。
 */
import type { PrismaClient } from "../../generated/prisma";

/** 全テーブルが空の DB（MySQL・D1 のどちらでも）に、全 21 テーブルぶんの架空データ（`@example.com`、`[E2E_TEST]`）を作る。 */
export async function seedFictionalData(p: PrismaClient): Promise<void> {
  await p.user.createMany({
    data: [
      { id: 1, name: "テスト太郎", email: "Admin_User@Example.com", password: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234", role: "admin", createdAt: new Date("2026-01-01T00:00:00.123Z") },
      { id: 2, name: "E2EUser A 😀", email: "e2euser_a@example.com", loginFailCount: 2, lockedUntil: new Date("2026-03-01T12:34:56.789Z"), mustChangePassword: true },
      { id: 3, name: "testuser_001", email: "testuser_001@example.com", secretWordHash: "$2b$10$secretsecretsecretsecretsecretsecretsecretsecretsecret" },
    ],
  });
  await p.author.createMany({ data: [{ id: 1, name: "テスト著者" }, { id: 2, name: "[E2E_TEST] 著者 B" }] });
  await p.award.createMany({ data: [{ id: 1, name: "[E2E_TEST] テスト賞" }] });
  await p.book.createMany({
    data: [
      { id: 1, title: "[E2E_TEST] 吾輩の本", authorId: 1, isbn: "9780000000001", publishedAt: new Date("2020-01-01T00:00:00.000Z") },
      { id: 2, title: "[E2E_TEST] 手動登録の本", authorId: 2, publishedAt: new Date("2021-06-15T00:00:00.000Z"), source: "manual", createdByUserId: 2 },
    ],
  });
  await p.bookIsbn.createMany({ data: [{ id: 1, bookId: 1, isbn: "9780000000001" }, { id: 2, bookId: 1, isbn: "9780000000002" }] });
  await p.awardEntry.createMany({ data: [{ id: 1, bookId: 1, awardId: 1, year: 2020, type: "winner" }] });
  await p.account.createMany({
    data: [{ id: "acct_abc123", userId: 2, type: "oauth", provider: "google", providerAccountId: "g-0001", access_token: "token-ダミー" }],
  });
  await p.session.createMany({ data: [{ id: "sess_1", sessionToken: "session-token-1", userId: 1, expires: new Date("2026-12-01T00:00:00.000Z") }] });
  await p.verificationToken.createMany({
    data: [
      { identifier: "e2euser_a@example.com", token: "Tok-B", expires: new Date("2026-02-01T00:00:00.000Z") },
      { identifier: "e2euser_a@example.com", token: "tok-a", expires: new Date("2026-02-01T00:00:00.000Z") },
    ],
  });
  await p.userLibrary.createMany({ data: [{ id: 1, userId: 2, systemid: "Tokyo_Test", libkey: "k1", name: "テスト図書館", pref: "東京都" }] });
  await p.favoriteAuthor.createMany({ data: [{ id: 1, userId: 2, authorId: 1 }] });
  await p.follow.createMany({ data: [{ id: 1, followerId: 2, followingId: 3 }, { id: 2, followerId: 3, followingId: 2 }] });
  await p.readingStatus.createMany({ data: [{ id: 1, userId: 2, bookId: 1, status: "read" }] });
  await p.review.createMany({
    data: [
      { id: 1, userId: 2, bookId: 1, body: "[E2E_TEST] 感想です。🌸 十分な長さの文章です。\n改行も含みます。" },
      { id: 2, userId: 3, bookId: 1, body: "[E2E_TEST] 別の感想。" },
    ],
  });
  await p.like.createMany({ data: [{ id: 1, userId: 3, reviewId: 1 }] });
  await p.report.createMany({ data: [{ id: 1, userId: 3, reviewId: 1 }] });
  await p.notification.createMany({ data: [{ id: 1, userId: 2, actorId: 3, type: "like", content: "[E2E_TEST] いいねが付きました" }] });
  await p.contactInquiry.createMany({ data: [{ id: 1, userId: 2, name: "テスト太郎", email: "contact@example.com", category: "other", subject: "[E2E_TEST] 件名", body: "本文" }] });
  await p.auditLog.createMany({
    data: [
      { id: 1, eventType: "user.login", actorUserId: 1 },
      { id: 2, eventType: "user.update", actorUserId: 1, detail: { fields: ["name", "日本語"], count: 2 } },
    ],
  });
  await p.bookEnrichmentJob.createMany({ data: [{ id: 1 }] });
  await p.bookEnrichmentItem.createMany({ data: [{ id: 1, jobId: 1, bookId: 1, resultDetail: { source: "rakuten", ok: true } }] });
}
