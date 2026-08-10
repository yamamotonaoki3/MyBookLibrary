import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/auth");

import { prismaMock } from "../../helpers/prismaMock";
import { signedIn, signedOut } from "../../helpers/authMock";
import { getRequest, jsonRequest, routeCtx, makeBook, makeReview } from "../../helpers";

// ─── /api/reviews ─────────────────────────────────────────────────────────────

describe("GET /api/reviews", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/reviews/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("4-1: 認証なし → 401を返す", async () => {
    signedOut();

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("4-2: 正常系 → レビュー一覧を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.review.findMany.mockResolvedValue([
      makeReview({
        body: "良い本でした",
        book: makeBook({ id: 10, title: "テスト本", coverImageUrl: null }),
      }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].body).toBe("良い本でした");
  });
});

describe("POST /api/reviews", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/reviews/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("4-3: 正常系 → 201を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.review.create.mockResolvedValue(
      makeReview({ body: "とても面白い本でした！読んで良かったです" })
    );

    const res = await POST(
      jsonRequest("/api/reviews", {
        body: { body: "とても面白い本でした！読んで良かったです", bookId: 10 },
      })
    );
    expect(res.status).toBe(201);
  });

  it("4-4: バリデーション失敗（短い本文）→ 400を返す", async () => {
    signedIn({ id: 1 });

    const res = await POST(jsonRequest("/api/reviews", { body: { body: "短い", bookId: 10 } }));
    expect(res.status).toBe(400);
  });
});

// ─── /api/reviews/[id] ────────────────────────────────────────────────────────

describe("DELETE /api/reviews/[id]", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/reviews/[id]/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  const call = (id: string) =>
    DELETE(getRequest(`/api/reviews/${id}`, undefined, { method: "DELETE" }), routeCtx({ id }));

  it("4-5: 本人のレビュー削除 → 204を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.review.findUnique.mockResolvedValue(makeReview({ id: 1, userId: 1 }));
    prismaMock.review.delete.mockResolvedValue({});

    const res = await call("1");
    expect(res.status).toBe(204);
  });

  it("4-6: 他人のレビュー削除 → 403を返す", async () => {
    signedIn({ id: 2 });
    prismaMock.review.findUnique.mockResolvedValue(makeReview({ id: 1, userId: 1 }));

    const res = await call("1");
    expect(res.status).toBe(403);
  });
});

// ─── /api/reviews/[id]/likes ──────────────────────────────────────────────────

describe("POST /api/reviews/[id]/likes", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/reviews/[id]/likes/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("4-7: いいね追加 → 201を返す", async () => {
    signedIn({ id: 2 });
    prismaMock.review.findUnique.mockResolvedValue(
      makeReview({ id: 1, userId: 1, book: { title: "テスト本", isbn: "9784000000000" } })
    );
    prismaMock.like.findUnique.mockResolvedValue(null);
    prismaMock.like.create.mockResolvedValue({});
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({});
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });
    prismaMock.like.count.mockResolvedValue(1);

    const res = await POST(
      getRequest("/api/reviews/1/likes", undefined, { method: "POST" }),
      routeCtx({ id: "1" })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.liked).toBe(true);
  });
});

describe("DELETE /api/reviews/[id]/likes", () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/reviews/[id]/likes/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("4-8: いいね解除 → 200を返す", async () => {
    signedIn({ id: 2 });
    prismaMock.like.findUnique.mockResolvedValue({ userId: 2, reviewId: 1 });
    prismaMock.like.delete.mockResolvedValue({});
    prismaMock.like.count.mockResolvedValue(0);

    const res = await DELETE(
      getRequest("/api/reviews/1/likes", undefined, { method: "DELETE" }),
      routeCtx({ id: "1" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.liked).toBe(false);
  });
});
