/**
 * 実DB統合テスト。`api/reviews/[id]/report` の重複通報を検証する。
 *
 * ルート側は `findUnique` での事前チェック→`create` という2段階の実装になっており、
 * モックでは「事前チェックが正しく効いているか」までは検証できるが、
 * 実際の `@@unique([userId, reviewId])` 制約と整合しているかは実DBでしか確認できない。
 */
jest.mock("@/lib/session");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { getRequest, routeCtx } from "../helpers";

let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/reviews/[id]/report/route"));
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("POST /api/reviews/[id]/report", () => {
  it("同じレビューを2回通報すると2回目は409になり、通報は1件のまま", async () => {
    const reporter = await testPrisma.user.create({
      data: { name: "通報者", email: "reporter@example.com", role: "user" },
    });
    const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
    const book = await testPrisma.book.create({
      data: { title: "テスト本", authorId: author.id, publishedAt: new Date("2026-01-01") },
    });
    const reviewOwner = await testPrisma.user.create({
      data: { name: "レビュー投稿者", email: "review-owner@example.com", role: "user" },
    });
    const review = await testPrisma.review.create({
      data: { userId: reviewOwner.id, bookId: book.id, body: "通報対象のレビュー本文です。" },
    });

    asUser(reporter.id);
    const call = () =>
      POST(
        getRequest(`/api/reviews/${review.id}/report`, undefined, { method: "POST" }),
        routeCtx({ id: String(review.id) })
      );

    const first = await call();
    expect(first.status).toBe(200);

    const second = await call();
    expect(second.status).toBe(409);

    const reports = await testPrisma.report.findMany({
      where: { userId: reporter.id, reviewId: review.id },
    });
    expect(reports).toHaveLength(1);
  });
});
