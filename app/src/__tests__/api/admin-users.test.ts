import { NextRequest } from "next/server";

const mockRequireAdminSession = jest.fn();
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockTransaction = jest.fn();
const mockUserCount = jest.fn();
const mockUserUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock("@/lib/session", () => ({
  requireAdminSession: () => mockRequireAdminSession(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      delete: jest.fn(),
      count: (...args: unknown[]) => mockUserCount(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    report: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    like: { deleteMany: jest.fn() },
    review: { deleteMany: jest.fn() },
    readingStatus: { deleteMany: jest.fn() },
    favoriteAuthor: { deleteMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    account: { deleteMany: jest.fn() },
    auditLog: { create: (...args: unknown[]) => mockAuditLogCreate(...args) },
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

  const mockUserDeleteMany = jest.fn();

  beforeAll(async () => {
    ({ DELETE } = await import("@/app/api/admin/users/[id]/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // 削除は $transaction(fn) というインタラクティブトランザクション形式を使う
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        report: { deleteMany: jest.fn() },
        notification: { deleteMany: jest.fn() },
        like: { deleteMany: jest.fn() },
        review: { deleteMany: jest.fn() },
        readingStatus: { deleteMany: jest.fn() },
        favoriteAuthor: { deleteMany: jest.fn() },
        session: { deleteMany: jest.fn() },
        account: { deleteMany: jest.fn() },
        user: { deleteMany: (...args: unknown[]) => mockUserDeleteMany(...args) },
      })
    );
  });

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
    mockUserDeleteMany.mockResolvedValue({ count: 1 });

    const res = await call("2");
    expect(res.status).toBe(200);
    expect(mockUserDeleteMany).toHaveBeenCalledWith({
      where: { id: 2, role: "user" },
    });
  });

  it("事前チェック後に管理者へ昇格していた（競合） → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "user" });
    mockUserDeleteMany.mockResolvedValue({ count: 0 });

    const res = await call("2");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/users/[id]", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeAll(async () => {
    ({ PATCH } = await import("@/app/api/admin/users/[id]/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // 降格時は $transaction(fn) というインタラクティブトランザクション形式を使うため、
    // 渡された関数を $queryRaw/user.update をモックしたtxで実行する
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
        user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
      })
    );
  });

  const call = (id: string, role: unknown) =>
    PATCH(
      new NextRequest("http://localhost/api/admin/users/" + id, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
      { params: Promise.resolve({ id }) }
    );

  it("管理者でない → 403を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(notAdmin);
    const res = await call("2", "admin");
    expect(res.status).toBe(403);
  });

  it("IDが数値でない → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    const res = await call("abc", "admin");
    expect(res.status).toBe(400);
  });

  it("自分自身のID → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    const res = await call("99", "admin");
    expect(res.status).toBe(400);
  });

  it("roleがadmin/user以外 → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    const res = await call("2", "superadmin");
    expect(res.status).toBe(400);
  });

  it("存在しないユーザー → 404を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue(null);
    const res = await call("2", "admin");
    expect(res.status).toBe(404);
  });

  it("既に同じroleである → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    const res = await call("2", "user");
    expect(res.status).toBe(400);
  });

  it("最後の管理者を降格しようとする → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "admin", email: "a2@example.com" });
    mockQueryRaw.mockResolvedValue([{ count: 1 }]);
    const res = await call("2", "user");
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("正常系: 一般ユーザーを管理者に昇格 → 200を返し監査ログを記録する", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    mockQueryRaw.mockResolvedValue([{ count: 1 }]);
    mockUserUpdate.mockResolvedValue({});

    const res = await call("2", "admin");
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { role: "admin" },
    });
    expect(mockAuditLogCreate).toHaveBeenCalled();
  });

  it("管理者数が上限（5人）に達している状態で昇格しようとする → 400を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    mockQueryRaw.mockResolvedValue([{ count: 5 }]);

    const res = await call("2", "admin");
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("管理者は最大5人までです");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("正常系: 管理者を降格（他にも管理者がいる） → 200を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockFindUnique.mockResolvedValue({ role: "admin", email: "a2@example.com" });
    mockQueryRaw.mockResolvedValue([{ count: 2 }]);
    mockUserUpdate.mockResolvedValue({});

    const res = await call("2", "user");
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { role: "user" },
    });
  });
});
