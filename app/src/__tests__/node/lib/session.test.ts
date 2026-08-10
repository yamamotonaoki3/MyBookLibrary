jest.mock("@/auth");
jest.mock("@/lib/prisma");

import { getAuthenticatedUserId, requireAdminSession } from "@/lib/session";
import { prismaMock } from "../../helpers/prismaMock";
import { authMock, signedIn, signedInAsAdmin, signedOut } from "../../helpers/authMock";

describe("getAuthenticatedUserId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未ログイン（session=null） → 401エラーを返す", async () => {
    signedOut();

    const result = await getAuthenticatedUserId();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("session.user.id が存在しない → 401エラーを返す", async () => {
    authMock.mockResolvedValue({ user: {} });

    const result = await getAuthenticatedUserId();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("ログイン済み → 数値のuserIdを返す", async () => {
    signedIn({ id: 42 });

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
    signedOut();

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(401);
  });

  it("一般ユーザー（role=user） → DBに問い合わせず403エラーを返す（fast-path）", async () => {
    signedIn({ id: 1, role: "user" });

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("管理者（JWT・DBともにrole=admin） → 数値のuserIdを返す", async () => {
    signedInAsAdmin({ id: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ role: "admin" });

    const result = await requireAdminSession();

    expect(result.userId).toBe(7);
    expect(result.error).toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { role: true },
    });
  });

  it("JWTはadminのままだがDB上はuserに降格済み → 403エラーを返す", async () => {
    signedInAsAdmin({ id: 7 });
    prismaMock.user.findUnique.mockResolvedValue({ role: "user" });

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(403);
  });

  it("JWTはadminだがDB上のユーザーが削除済み → 403エラーを返す", async () => {
    signedInAsAdmin({ id: 7 });
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(403);
  });
});
