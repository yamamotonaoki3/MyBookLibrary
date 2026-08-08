jest.mock("@/lib/prisma");
jest.mock("@/auth");

import { prismaMock } from "../helpers/prismaMock";
import { signedIn, signedOut } from "../helpers/authMock";
import {
  getRequest,
  jsonRequest,
  routeCtx,
  makeAuthor,
  makeBook,
  makeFavoriteAuthor,
  makeReadingStatus,
} from "../helpers";

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
    signedIn({ id: 1 });
    prismaMock.author.findFirst.mockResolvedValue(null);
    prismaMock.author.create.mockResolvedValue(makeAuthor());
    prismaMock.book.findFirst.mockResolvedValue(null);
    prismaMock.book.create.mockResolvedValue(makeBook());
    prismaMock.readingStatus.upsert.mockResolvedValue(makeReadingStatus({ status: "reading" }));

    const res = await POST(jsonRequest("/api/reading-status", { body: validBody }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("reading");
  });

  it("5-2: 既存書籍の更新（upsert）— 既存の著者・書籍がある場合はそのまま使う", async () => {
    signedIn({ id: 1 });
    prismaMock.author.findFirst.mockResolvedValue(makeAuthor());
    prismaMock.book.findFirst.mockResolvedValue(makeBook());
    prismaMock.readingStatus.upsert.mockResolvedValue(makeReadingStatus({ status: "read" }));

    const res = await POST(
      jsonRequest("/api/reading-status", { body: { ...validBody, status: "read" } })
    );
    expect(res.status).toBe(200);
    expect(prismaMock.author.create).not.toHaveBeenCalled();
    expect(prismaMock.book.create).not.toHaveBeenCalled();
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
    signedOut();

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
    signedIn({ id: 1 });
    prismaMock.author.findFirst.mockResolvedValue(null);
    prismaMock.author.create.mockResolvedValue(makeAuthor({ name: "村上春樹" }));
    prismaMock.favoriteAuthor.create.mockResolvedValue(makeFavoriteAuthor());

    const res = await POST(
      jsonRequest("/api/favorite-authors", { body: { authorName: "村上春樹" } })
    );
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
    signedIn({ id: 1 });
    prismaMock.favoriteAuthor.delete.mockResolvedValue({});

    const res = await DELETE(
      getRequest("/api/favorite-authors/10", undefined, { method: "DELETE" }),
      routeCtx({ authorId: "10" })
    );
    expect(res.status).toBe(204);
  });
});
