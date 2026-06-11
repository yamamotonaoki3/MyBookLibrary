import { NextRequest } from "next/server";

// ─── Prisma モック ────────────────────────────────────────────────────────────
const mockReviewFindMany = jest.fn();
const mockReviewCreate = jest.fn();
const mockReviewFindUnique = jest.fn();
const mockReviewDelete = jest.fn();
const mockReviewUpdate = jest.fn();
const mockLikeFindUnique = jest.fn();
const mockLikeCreate = jest.fn();
const mockLikeDelete = jest.fn();
const mockLikeCount = jest.fn();
const mockNotificationFindFirst = jest.fn();
const mockNotificationCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findMany: (...args: unknown[]) => mockReviewFindMany(...args),
      create: (...args: unknown[]) => mockReviewCreate(...args),
      findUnique: (...args: unknown[]) => mockReviewFindUnique(...args),
      delete: (...args: unknown[]) => mockReviewDelete(...args),
      update: (...args: unknown[]) => mockReviewUpdate(...args),
    },
    like: {
      findUnique: (...args: unknown[]) => mockLikeFindUnique(...args),
      create: (...args: unknown[]) => mockLikeCreate(...args),
      delete: (...args: unknown[]) => mockLikeDelete(...args),
      count: (...args: unknown[]) => mockLikeCount(...args),
    },
    notification: {
      findFirst: (...args: unknown[]) => mockNotificationFindFirst(...args),
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

// ─── セッションモック ─────────────────────────────────────────────────────────
const mockAuth = jest.fn();
jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ─── /api/reviews ─────────────────────────────────────────────────────────────

describe("GET /api/reviews", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/reviews/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("4-1: 認証なし → 401を返す", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("4-2: 正常系 → レビュー一覧を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockReviewFindMany.mockResolvedValue([
      { id: 1, body: "良い本でした", isSpoiler: false, book: { id: 10, title: "テスト本", coverImageUrl: null } },
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
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockReviewCreate.mockResolvedValue({ id: 1, body: "とても面白い本でした！読んで良かったです", isSpoiler: false });

    const req = new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({ body: "とても面白い本でした！読んで良かったです", bookId: 10 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("4-4: バリデーション失敗（短い本文）→ 400を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });

    const req = new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({ body: "短い", bookId: 10 }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
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

  it("4-5: 本人のレビュー削除 → 204を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockReviewFindUnique.mockResolvedValue({ id: 1, userId: 1, body: "テスト" });
    mockReviewDelete.mockResolvedValue({});

    const req = new NextRequest("http://localhost/api/reviews/1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(204);
  });

  it("4-6: 他人のレビュー削除 → 403を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2" } });
    mockReviewFindUnique.mockResolvedValue({ id: 1, userId: 1, body: "テスト" });

    const req = new NextRequest("http://localhost/api/reviews/1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "1" }) });
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
    mockAuth.mockResolvedValue({ user: { id: "2" } });
    mockReviewFindUnique.mockResolvedValue({
      id: 1, userId: 1, body: "テスト",
      book: { title: "テスト本", isbn: "9784000000000" },
    });
    mockLikeFindUnique.mockResolvedValue(null);
    mockLikeCreate.mockResolvedValue({});
    mockNotificationFindFirst.mockResolvedValue(null);
    mockNotificationCreate.mockResolvedValue({});
    mockLikeCount.mockResolvedValue(1);

    const req = new NextRequest("http://localhost/api/reviews/1/likes", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "1" }) });
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
    mockAuth.mockResolvedValue({ user: { id: "2" } });
    mockLikeFindUnique.mockResolvedValue({ userId: 2, reviewId: 1 });
    mockLikeDelete.mockResolvedValue({});
    mockLikeCount.mockResolvedValue(0);

    const req = new NextRequest("http://localhost/api/reviews/1/likes", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.liked).toBe(false);
  });
});
