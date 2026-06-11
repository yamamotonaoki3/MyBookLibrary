import { NextRequest } from "next/server";

// ─── Prisma モック ────────────────────────────────────────────────────────────
const mockAuthorFindFirst = jest.fn();
const mockAuthorCreate = jest.fn();
const mockBookFindFirst = jest.fn();
const mockBookCreate = jest.fn();
const mockReadingStatusDeleteMany = jest.fn();
const mockReadingStatusUpsert = jest.fn();
const mockFavoriteAuthorFindMany = jest.fn();
const mockFavoriteAuthorCreate = jest.fn();
const mockFavoriteAuthorDelete = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    author: {
      findFirst: (...args: unknown[]) => mockAuthorFindFirst(...args),
      create: (...args: unknown[]) => mockAuthorCreate(...args),
    },
    book: {
      findFirst: (...args: unknown[]) => mockBookFindFirst(...args),
      create: (...args: unknown[]) => mockBookCreate(...args),
    },
    readingStatus: {
      deleteMany: (...args: unknown[]) => mockReadingStatusDeleteMany(...args),
      upsert: (...args: unknown[]) => mockReadingStatusUpsert(...args),
    },
    favoriteAuthor: {
      findMany: (...args: unknown[]) => mockFavoriteAuthorFindMany(...args),
      create: (...args: unknown[]) => mockFavoriteAuthorCreate(...args),
      delete: (...args: unknown[]) => mockFavoriteAuthorDelete(...args),
    },
  },
}));

// ─── セッションモック ─────────────────────────────────────────────────────────
const mockAuth = jest.fn();
jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ─── /api/reading-status ──────────────────────────────────────────────────────

describe("POST /api/reading-status", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/reading-status/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  const validBody = {
    title: "吾輩は猫である",
    author: "夏目漱石",
    status: "reading",
  };

  it("5-1: 新規作成 — 著者・書籍がない場合は作成してステータスを返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockAuthorFindFirst.mockResolvedValue(null);
    mockAuthorCreate.mockResolvedValue({ id: 10, name: "夏目漱石" });
    mockBookFindFirst.mockResolvedValue(null);
    mockBookCreate.mockResolvedValue({ id: 20, title: "吾輩は猫である" });
    mockReadingStatusUpsert.mockResolvedValue({ id: 1, userId: 1, bookId: 20, status: "reading" });

    const req = new Request("http://localhost/api/reading-status", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("reading");
  });

  it("5-2: 既存書籍の更新（upsert）— 既存の著者・書籍がある場合はそのまま使う", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockAuthorFindFirst.mockResolvedValue({ id: 10, name: "夏目漱石" });
    mockBookFindFirst.mockResolvedValue({ id: 20, title: "吾輩は猫である" });
    mockReadingStatusUpsert.mockResolvedValue({ id: 1, userId: 1, bookId: 20, status: "read" });

    const req = new Request("http://localhost/api/reading-status", {
      method: "POST",
      body: JSON.stringify({ ...validBody, status: "read" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockAuthorCreate).not.toHaveBeenCalled();
    expect(mockBookCreate).not.toHaveBeenCalled();
  });
});

// ─── /api/favorite-authors ────────────────────────────────────────────────────

describe("GET /api/favorite-authors", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/favorite-authors/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("5-3: 認証なし → 401を返す", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/favorite-authors", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/favorite-authors/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("5-4: 著者追加 — 201を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockAuthorFindFirst.mockResolvedValue(null);
    mockAuthorCreate.mockResolvedValue({ id: 10, name: "村上春樹" });
    mockFavoriteAuthorCreate.mockResolvedValue({ id: 1, userId: 1, authorId: 10 });

    const req = new Request("http://localhost/api/favorite-authors", {
      method: "POST",
      body: JSON.stringify({ authorName: "村上春樹" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/favorite-authors/[authorId]", () => {
  let DELETE: (req: Request, ctx: { params: Promise<{ authorId: string }> }) => Promise<Response>;

  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/favorite-authors/[authorId]/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("5-5: 著者削除 — 204を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockFavoriteAuthorDelete.mockResolvedValue({});

    const req = new Request("http://localhost/api/favorite-authors/10", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ authorId: "10" }) });
    expect(res.status).toBe(204);
  });
});
