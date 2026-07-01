import { NextRequest } from "next/server";

const mockRequireAdminSession = jest.fn();
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/session", () => ({
  requireAdminSession: () => mockRequireAdminSession(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      delete: jest.fn(),
    },
    report: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    like: { deleteMany: jest.fn() },
    review: { deleteMany: jest.fn() },
    readingStatus: { deleteMany: jest.fn() },
    favoriteAuthor: { deleteMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    account: { deleteMany: jest.fn() },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const adminOk = { userId: 99, error: null };
const notAdmin = {
  userId: null,
  error: new Response(JSON.stringify({ error: "権限がありません" }), { status: 403 }),
};

describe("GET /api/admin/users", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/users/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("管理者でない → 403を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(notAdmin);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("管理者 → ユーザー一覧を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindMany.mockResolvedValue([{ id: 1, name: "a", email: "a@example.com", role: "user" }]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
  });
});

describe("DELETE /api/admin/users/[id]", () => {
  let DELETE: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/admin/users/[id]/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  const call = (id: string) =>
    DELETE(new NextRequest("http://localhost/api/admin/users/" + id), {
      params: Promise.resolve({ id }),
    });

  it("管理者でない → 403を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(notAdmin);
    const res = await call("2");
    expect(res.status).toBe(403);
  });

  it("IDが数値でない → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    const res = await call("abc");
    expect(res.status).toBe(400);
  });

  it("自分自身のID → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    const res = await call("99");
    expect(res.status).toBe(400);
  });

  it("存在しないユーザー → 404を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue(null);
    const res = await call("2");
    expect(res.status).toBe(404);
  });

  it("対象が管理者 → 400を返す（管理者は削除不可）", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "admin" });
    const res = await call("2");
    expect(res.status).toBe(400);
  });

  it("正常系: 一般ユーザーを削除 → 200を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "user" });
    mockTransaction.mockResolvedValue([]);

    const res = await call("2");
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });
});
