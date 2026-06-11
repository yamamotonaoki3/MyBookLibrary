import { NextRequest } from "next/server";

// ─── Prisma モック ────────────────────────────────────────────────────────────
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// bcrypt をモック（ハッシュ計算をスキップして高速化）
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
  compare: jest.fn().mockResolvedValue(true),
}));

// ─── /api/auth/register ───────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/auth/register/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validBody = {
    name: "テストユーザー",
    email: "test@example.com",
    password: "password123",
    confirmPassword: "password123",
  };

  it("3-1: 正常系 — 201を返す", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 1 });

    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("3-2: メール重複 — 409を返す", async () => {
    mockFindUnique.mockResolvedValue({ id: 1, email: "test@example.com" });

    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("3-3: バリデーション失敗（短いパスワード） — 400を返す", async () => {
    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...validBody, password: "short", confirmPassword: "short" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── /api/auth/reset-password ─────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/auth/reset-password/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("3-4: step=check — 存在するメール → 200を返す", async () => {
    mockFindUnique.mockResolvedValue({ id: 1, email: "user@example.com", password: "hashed" });

    const req = new NextRequest("http://localhost/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ step: "check", email: "user@example.com" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("3-5: step=check — 存在しないメール → 404を返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ step: "check", email: "notfound@example.com" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("3-6: step=reset — 正常系（パスワード更新）→ 200を返す", async () => {
    mockFindUnique.mockResolvedValue({ id: 1, email: "user@example.com", password: "old_hash" });
    mockUpdate.mockResolvedValue({ id: 1 });

    const req = new NextRequest("http://localhost/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        step: "reset",
        email: "user@example.com",
        password: "newpassword1",
        confirmPassword: "newpassword1",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "user@example.com" },
        data: expect.objectContaining({ loginFailCount: 0, lockedUntil: null }),
      })
    );
  });

  it("3-7: step=reset — パスワード不一致 → 400を返す", async () => {
    const req = new NextRequest("http://localhost/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        step: "reset",
        email: "user@example.com",
        password: "newpassword1",
        confirmPassword: "different",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ─── /api/auth/remaining-attempts ────────────────────────────────────────────

describe("GET /api/auth/remaining-attempts", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/auth/remaining-attempts/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("3-8: ロックなしユーザー（failCount=3）→ remaining=7を返す", async () => {
    mockFindUnique.mockResolvedValue({ loginFailCount: 3 });

    const req = new NextRequest(
      "http://localhost/api/auth/remaining-attempts?email=user@example.com"
    );

    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remaining).toBe(7);
  });

  it("3-9: ロック中ユーザー（failCount=10）→ remaining=0を返す", async () => {
    mockFindUnique.mockResolvedValue({ loginFailCount: 10 });

    const req = new NextRequest(
      "http://localhost/api/auth/remaining-attempts?email=locked@example.com"
    );

    const res = await GET(req);
    const json = await res.json();
    expect(json.remaining).toBe(0);
  });

  it("メールパラメータなし → remaining=nullを返す", async () => {
    const req = new NextRequest("http://localhost/api/auth/remaining-attempts");

    const res = await GET(req);
    const json = await res.json();
    expect(json.remaining).toBeNull();
  });
});
