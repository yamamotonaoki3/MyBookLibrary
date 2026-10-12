/**
 * 実DB統合テスト。NextAuth の Prisma アダプタ（Google ログインのユーザー作成・アカウント連携）を検証する。
 *
 * 本アプリのアダプタ（`createAdapter`）は、@auth/prisma-adapter を、Int 型のユーザー ID と
 * メールアドレスの小文字正規化（#651）に対応させるラッパー。MySQL と D1 の両方で同じ結果になることを確認する。
 * next-auth 本体（ESM）は読み込めないためスタブにするが、アダプタ（@auth/prisma-adapter）は本物を使う。
 */
jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));
jest.mock("next-auth/providers/credentials", () => jest.fn((config: unknown) => config));
jest.mock("next-auth/providers/google", () => jest.fn());
jest.mock("../../auth.config", () => ({ authConfig: {} }));

import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { prisma } from "@/lib/prisma";
import { createAdapter } from "@/auth";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

const rawAdapter = createAdapter() as Required<Pick<Adapter, "createUser" | "getUser" | "getUserByEmail" | "getUserByAccount" | "updateUser" | "deleteUser" | "linkAccount">>;

// Adapter の createUser は ID 付きの AdapterUser を受け取る型だが、実際には ID なしで呼ばれる（ID は DB が採番する）
const adapter = {
  ...rawAdapter,
  createUser: (data: Omit<AdapterUser, "id">) => rawAdapter.createUser(data as AdapterUser),
};

const googleAccount = (userId: string, providerAccountId = "google-sub-001"): AdapterAccount => ({
  userId,
  type: "oidc",
  provider: "google",
  providerAccountId,
  access_token: "テスト用アクセストークン",
  expires_at: 1_900_000_000,
  token_type: "bearer",
  scope: "openid email profile",
  id_token: "テスト用IDトークン",
});

describe("Google ログイン用の認証アダプタ", () => {
  it("ユーザーを作成すると、ID は文字列で返り、メールアドレスは小文字で保存される", async () => {
    const created = await adapter.createUser({
      name: "Google ユーザー",
      email: "Google.User@Example.COM",
      image: "https://example.com/avatar.png",
      emailVerified: new Date("2026-01-01T00:00:00Z"),
    });

    expect(typeof created.id).toBe("string");
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: Number(created.id) } });
    expect(stored.email).toBe("google.user@example.com");
    expect(stored.role).toBe("user");
    expect(stored.emailVerified?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("メールアドレスは大文字小文字を区別せずに検索できる", async () => {
    const created = await adapter.createUser({ name: "A", email: "case.check@example.com", emailVerified: null });

    const found = await adapter.getUserByEmail("CASE.Check@Example.com");

    expect(found?.id).toBe(created.id);
    expect(await adapter.getUserByEmail("nobody@example.com")).toBeNull();
  });

  it("文字列の ID でユーザーを取得・更新できる", async () => {
    const created = await adapter.createUser({ name: "更新前", email: "update@example.com", emailVerified: null });

    expect((await adapter.getUser(created.id))?.name).toBe("更新前");
    const updated = await adapter.updateUser({ id: created.id, name: "更新後" });

    expect(updated.name).toBe("更新後");
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: Number(created.id) } })).name).toBe("更新後");
    expect(await adapter.getUser("999999")).toBeNull();
  });

  it("アカウントを連携すると、プロバイダーのアカウント ID からユーザーを取得できる", async () => {
    const created = await adapter.createUser({ name: "連携", email: "link@example.com", emailVerified: null });

    await adapter.linkAccount(googleAccount(created.id));

    const accounts = await testPrisma.account.findMany();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].userId).toBe(Number(created.id));
    expect(accounts[0].provider).toBe("google");
    const user = await adapter.getUserByAccount({ provider: "google", providerAccountId: "google-sub-001" });
    expect(user?.id).toBe(created.id);
    expect(await adapter.getUserByAccount({ provider: "google", providerAccountId: "unknown" })).toBeNull();
  });

  it("同じプロバイダーのアカウントを二重に連携することはできない", async () => {
    const a = await adapter.createUser({ name: "A", email: "a@example.com", emailVerified: null });
    const b = await adapter.createUser({ name: "B", email: "b@example.com", emailVerified: null });
    await adapter.linkAccount(googleAccount(a.id));

    await expect(adapter.linkAccount(googleAccount(b.id))).rejects.toThrow();
    expect(await testPrisma.account.count()).toBe(1);
  });

  it("ユーザーを削除すると、連携したアカウントも削除される", async () => {
    const created = await adapter.createUser({ name: "削除", email: "delete@example.com", emailVerified: null });
    await adapter.linkAccount(googleAccount(created.id));

    await adapter.deleteUser(created.id);

    expect(await testPrisma.user.count()).toBe(0);
    expect(await testPrisma.account.count()).toBe(0);
  });
});
