const mockAuth = jest.fn();

jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

import { getAuthenticatedUserId, requireAdminSession } from "@/lib/session";

describe("getAuthenticatedUserId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未ログイン（session=null） → 401エラーを返す", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getAuthenticatedUserId();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("session.user.id が存在しない → 401エラーを返す", async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await getAuthenticatedUserId();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("ログイン済み → 数値のuserIdを返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "42" } });

    const result = await getAuthenticatedUserId();

    expect(result.userId).toBe(42);
    expect(result.error).toBeNull();
  });
});

describe("requireAdminSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未ログイン → 401エラーを返す", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("一般ユーザー（role=user） → 403エラーを返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "user" } });

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(403);
  });

  it("管理者（role=admin） → 数値のuserIdを返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "7", role: "admin" } });

    const result = await requireAdminSession();

    expect(result.userId).toBe(7);
    expect(result.error).toBeNull();
  });
});
