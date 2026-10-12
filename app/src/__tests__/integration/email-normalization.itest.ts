/**
 * 実DB統合テスト。メールアドレスの小文字正規化（#651）を検証する。
 * D1（SQLite）は文字列比較で大文字小文字を区別するため、保存・検索の両方を小文字に統一している。
 */
jest.mock("@/lib/session");

// next-auth は ESM のため Jest では読み込まない。authorizeCredentials は設定に依存しない関数なのでスタブで足りる
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));
jest.mock("next-auth/providers/credentials", () => jest.fn((config: unknown) => config));
jest.mock("next-auth/providers/google", () => jest.fn());
jest.mock("../../auth.config", () => ({ authConfig: {} }));

import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { jsonRequest } from "../helpers";
import { prisma } from "@/lib/prisma";
import { authorizeCredentials } from "@/auth";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

describe("ログイン（authorizeCredentials）", () => {
  it("大文字混じりで入力しても、小文字で保存されたユーザーでログインできる", async () => {
    const password = "TestPass123!";
    await testPrisma.user.create({
      data: {
        name: "ログイン確認",
        email: "login-check@example.com",
        role: "user",
        password: await bcrypt.hash(password, 4),
      },
    });

    const result = await authorizeCredentials("Login-Check@EXAMPLE.com", password);

    expect(result?.email).toBe("login-check@example.com");
  });
});

describe("POST /api/auth/register", () => {
  it("大文字混じりのメールアドレスは小文字で保存され、大文字違いの再登録は重複として拒否される", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const body = {
      name: "登録確認",
      email: "Register.Check@Example.COM",
      password: "TestPass123!",
      confirmPassword: "TestPass123!",
      secretWord: "ひみつのことば",
    };

    const first = await POST(jsonRequest("/api/auth/register", { body }));
    expect(first.status).toBe(201);
    const stored = await testPrisma.user.findMany({ select: { email: true } });
    expect(stored).toEqual([{ email: "register.check@example.com" }]);

    const second = await POST(
      jsonRequest("/api/auth/register", { body: { ...body, email: "REGISTER.CHECK@example.com" } })
    );
    expect(second.status).toBe(409);
    expect(await testPrisma.user.count()).toBe(1);
  });
});

describe("マイグレーション 20261012000000_lowercase_user_emails", () => {
  it("既存の大文字混じりのメールアドレスを小文字に更新する", async () => {
    await testPrisma.user.create({ data: { name: "旧データ", email: "Old.Data@Example.COM", role: "user" } });
    const sql = readFileSync(
      path.join(process.cwd(), "prisma/migrations/20261012000000_lowercase_user_emails/migration.sql"),
      "utf8"
    )
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join("\n");

    await testPrisma.$executeRawUnsafe(sql);

    const rows = await testPrisma.$queryRaw<{ email: string }[]>`SELECT email FROM users`;
    expect(rows.map((r) => String(r.email))).toEqual(["old.data@example.com"]);
  });
});
