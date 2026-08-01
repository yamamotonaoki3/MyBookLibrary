const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}));

const mockCompare = jest.fn();
jest.mock("bcryptjs", () => ({
  compare: (...args: unknown[]) => mockCompare(...args),
}));

jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));
jest.mock("next-auth/providers/credentials", () => jest.fn((config: unknown) => config));
jest.mock("next-auth/providers/google", () => jest.fn());
jest.mock("../../auth.config", () => ({ authConfig: {} }));

import { authorizeCredentials, LOCK_THRESHOLD } from "@/auth";

describe("authorizeCredentials", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("email/password が未入力 → nullを返す", async () => {
    expect(await authorizeCredentials(undefined, undefined)).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("ユーザーが存在しない → nullを返す", async () => {
    mockFindUnique.mockResolvedValue(null);

    expect(await authorizeCredentials("notfound@example.com", "password123")).toBeNull();
  });

  it("パスワード未設定ユーザー（OAuth登録のみ） → nullを返す", async () => {
    mockFindUnique.mockResolvedValue({ id: 1, email: "a@example.com", password: null });

    expect(await authorizeCredentials("a@example.com", "password123")).toBeNull();
  });

  it("ロック中（lockedUntilが未来） → ACCOUNT_LOCKEDエラーをthrowする", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "a@example.com",
      password: "hashed",
      lockedUntil: new Date(Date.now() + 60_000),
      loginFailCount: 10,
    });

    await expect(authorizeCredentials("a@example.com", "password123")).rejects.toThrow(
      "ACCOUNT_LOCKED"
    );
  });

  it("ロック期限切れ（lockedUntilが過去） → ロック扱いにしない", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "a@example.com",
      password: "hashed",
      lockedUntil: new Date(Date.now() - 60_000),
      loginFailCount: 10,
    });
    mockCompare.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});

    const result = await authorizeCredentials("a@example.com", "password123");
    expect(result).not.toBeNull();
  });

  it("パスワード不一致（failCount 9→10未満） → 失敗カウントを加算しロックしない", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "a@example.com",
      password: "hashed",
      lockedUntil: null,
      loginFailCount: 8,
    });
    mockCompare.mockResolvedValue(false);

    const result = await authorizeCredentials("a@example.com", "wrongpassword");

    expect(result).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { loginFailCount: 9, lockedUntil: null },
    });
  });

  it("パスワード不一致で failCount が閾値到達（9→10） → ロックする（境界値）", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "a@example.com",
      password: "hashed",
      lockedUntil: null,
      loginFailCount: LOCK_THRESHOLD - 1,
    });
    mockCompare.mockResolvedValue(false);

    await authorizeCredentials("a@example.com", "wrongpassword");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        loginFailCount: LOCK_THRESHOLD,
        lockedUntil: expect.any(Date),
      },
    });
  });

  it("正常系: パスワード一致 → 失敗カウント・ロックをリセットしユーザー情報を返す", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      email: "a@example.com",
      password: "hashed",
      name: "テストユーザー",
      role: "user",
      lockedUntil: null,
      loginFailCount: 3,
    });
    mockCompare.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});

    const result = await authorizeCredentials("a@example.com", "correctpassword");

    expect(result).toEqual({
      id: "1",
      email: "a@example.com",
      name: "テストユーザー",
      role: "user",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { loginFailCount: 0, lockedUntil: null },
    });
  });
});
