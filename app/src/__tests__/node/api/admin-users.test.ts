import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asAdmin, asForbidden } from "../../helpers/sessionMock";
import { getRequest, jsonRequest, routeCtx, makeUser } from "../../helpers";

// 管理者自身のID。「自分自身を操作しようとした」ケースの判定に使われる。
const ADMIN_ID = 99;

describe("GET /api/admin/users", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/users/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("管理者でない → 403を返す", async () => {
    asForbidden();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("管理者 → ユーザー一覧を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findMany.mockResolvedValue([makeUser({ name: "a", email: "a@example.com" })]);

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

  // $transaction のコールバックには prismaMock 自身が渡されるため、
  // トランザクション内の呼び出しも prismaMock.user.deleteMany で検証できる。
  const call = (id: string) =>
    DELETE(getRequest(`/api/admin/users/${id}`, undefined, { method: "DELETE" }), routeCtx({ id }));

  it("管理者でない → 403を返す", async () => {
    asForbidden();
    const res = await call("2");
    expect(res.status).toBe(403);
  });

  it("IDが数値でない → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    const res = await call("abc");
    expect(res.status).toBe(400);
  });

  it("自分自身のID → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    const res = await call(String(ADMIN_ID));
    expect(res.status).toBe(400);
  });

  it("存在しないユーザー → 404を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await call("2");
    expect(res.status).toBe(404);
  });

  it("対象が管理者 → 400を返す（管理者は削除不可）", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "admin" });
    const res = await call("2");
    expect(res.status).toBe(400);
  });

  it("正常系: 一般ユーザーを削除 → 200を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "user" });
    prismaMock.user.deleteMany.mockResolvedValue({ count: 1 });

    const res = await call("2");
    expect(res.status).toBe(200);
    expect(prismaMock.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 2, role: "user" },
    });
  });

  it("事前チェック後に管理者へ昇格していた（競合） → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "user" });
    prismaMock.user.deleteMany.mockResolvedValue({ count: 0 });

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

  beforeEach(() => jest.clearAllMocks());

  const call = (id: string, role: unknown) =>
    PATCH(
      jsonRequest(`/api/admin/users/${id}`, { method: "PATCH", body: { role } }),
      routeCtx({ id })
    );

  it("管理者でない → 403を返す", async () => {
    asForbidden();
    const res = await call("2", "admin");
    expect(res.status).toBe(403);
  });

  it("IDが数値でない → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    const res = await call("abc", "admin");
    expect(res.status).toBe(400);
  });

  it("自分自身のID → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    const res = await call(String(ADMIN_ID), "admin");
    expect(res.status).toBe(400);
  });

  it("roleがadmin/user以外 → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    const res = await call("2", "superadmin");
    expect(res.status).toBe(400);
  });

  it("存在しないユーザー → 404を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await call("2", "admin");
    expect(res.status).toBe(404);
  });

  it("既に同じroleである → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    const res = await call("2", "user");
    expect(res.status).toBe(400);
  });

  it("最後の管理者を降格しようとする → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "admin", email: "a2@example.com" });
    prismaMock.$queryRaw.mockResolvedValue([{ count: 1 }]);
    const res = await call("2", "user");
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("正常系: 一般ユーザーを管理者に昇格 → 200を返し監査ログを記録する", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    prismaMock.$queryRaw.mockResolvedValue([{ count: 1 }]);
    prismaMock.user.update.mockResolvedValue({});

    const res = await call("2", "admin");
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { role: "admin" },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("管理者数が上限（5人）に達している状態で昇格しようとする → 400を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", email: "u@example.com" });
    prismaMock.$queryRaw.mockResolvedValue([{ count: 5 }]);

    const res = await call("2", "admin");
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("管理者は最大5人までです");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("正常系: 管理者を降格（他にも管理者がいる） → 200を返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ role: "admin", email: "a2@example.com" });
    prismaMock.$queryRaw.mockResolvedValue([{ count: 2 }]);
    prismaMock.user.update.mockResolvedValue({});

    const res = await call("2", "user");
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { role: "user" },
    });
  });
});
