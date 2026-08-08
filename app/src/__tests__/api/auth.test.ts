import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");

// bcrypt をモック（ハッシュ計算をスキップして高速化）
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
  compare: jest.fn().mockResolvedValue(true),
}));

import { prismaMock } from "../helpers/prismaMock";
import { getRequest, jsonRequest, makeUser } from "../helpers";

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
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(makeUser());

    const res = await POST(jsonRequest("/api/auth/register", { body: validBody }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("3-2: メール重複 — 409を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue(makeUser({ email: "test@example.com" }));

    const res = await POST(jsonRequest("/api/auth/register", { body: validBody }));
    expect(res.status).toBe(409);
  });

  it("3-3: バリデーション失敗（短いパスワード） — 400を返す", async () => {
    const res = await POST(
      jsonRequest("/api/auth/register", {
        body: { ...validBody, password: "short", confirmPassword: "short" },
      })
    );
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

  const resetBody = {
    step: "reset",
    email: "user@example.com",
    secretWord: "ひみつのことば",
    password: "newpassword1",
    confirmPassword: "newpassword1",
  };

  it("3-4: step=check — 秘密の言葉設定済みユーザー → 200を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "hashed", secretWordHash: "hashed_secret_word" })
    );

    const res = await POST(
      jsonRequest("/api/auth/reset-password", {
        body: { step: "check", email: "user@example.com" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("3-4b: step=check — 秘密の言葉未設定ユーザー → 422を返し通知を作成する", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "hashed", secretWordHash: null })
    );
    prismaMock.notification.findFirst.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("/api/auth/reset-password", {
        body: { step: "check", email: "user@example.com" },
      })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("SECRET_WORD_NOT_SET");
    expect(prismaMock.notification.create).toHaveBeenCalled();
  });

  it("3-5: step=check — 存在しないメール → 404を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("/api/auth/reset-password", {
        body: { step: "check", email: "notfound@example.com" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("3-6: step=reset — 正常系（パスワード更新）→ 200を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "old_hash", secretWordHash: "hashed_secret_word" })
    );
    prismaMock.user.update.mockResolvedValue(makeUser());

    const res = await POST(jsonRequest("/api/auth/reset-password", { body: resetBody }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ loginFailCount: 0, lockedUntil: null }),
      })
    );
  });

  it("3-7: step=reset — パスワード不一致 → 400を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "old_hash", secretWordHash: "hashed_secret_word" })
    );

    const res = await POST(
      jsonRequest("/api/auth/reset-password", {
        body: { ...resetBody, confirmPassword: "different" },
      })
    );
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
    prismaMock.user.findUnique.mockResolvedValue({ loginFailCount: 3 });

    const res = await GET(
      getRequest("/api/auth/remaining-attempts", { email: "user@example.com" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remaining).toBe(7);
  });

  it("3-9: ロック中ユーザー（failCount=10）→ remaining=0を返す", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ loginFailCount: 10 });

    const res = await GET(
      getRequest("/api/auth/remaining-attempts", { email: "locked@example.com" })
    );
    const json = await res.json();
    expect(json.remaining).toBe(0);
  });

  it("メールパラメータなし → remaining=nullを返す", async () => {
    const res = await GET(getRequest("/api/auth/remaining-attempts"));
    const json = await res.json();
    expect(json.remaining).toBeNull();
  });
});
