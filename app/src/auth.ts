import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import type { Adapter, AdapterUser } from "next-auth/adapters";

const LOCK_THRESHOLD = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

// PrismaAdapterはString IDを想定しているため、Int型のUserIdに対応するラッパー
function createAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;
  return {
    ...base,
    createUser: async (data: Omit<AdapterUser, "id">) => {
      const user = await (base.createUser as (d: unknown) => Promise<AdapterUser>)(data);
      return { ...user, id: String(user.id) };
    },
    getUser: async (id: string) => {
      const user = await (base.getUser as (id: unknown) => Promise<AdapterUser | null>)(Number(id));
      return user ? { ...user, id: String(user.id) } : null;
    },
    updateUser: async (user: Partial<AdapterUser> & Pick<AdapterUser, "id">) => {
      const updated = await (base.updateUser as (u: unknown) => Promise<AdapterUser>)({
        ...user,
        id: Number(user.id),
      });
      return { ...updated, id: String(updated.id) };
    },
    deleteUser: (id: string) =>
      (base.deleteUser as ((id: unknown) => Promise<void>) | undefined)?.(Number(id)),
    linkAccount: (account: Parameters<NonNullable<Adapter["linkAccount"]>>[0]) =>
      (base.linkAccount as (a: unknown) => ReturnType<NonNullable<Adapter["linkAccount"]>>)({
        ...account,
        userId: Number(account.userId),
      }),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: createAdapter(),
  session: { strategy: "jwt" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error("ACCOUNT_LOCKED");
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          const newCount = user.loginFailCount + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              loginFailCount: newCount,
              lockedUntil:
                newCount >= LOCK_THRESHOLD
                  ? new Date(Date.now() + LOCK_DURATION_MS)
                  : null,
            },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { loginFailCount: 0, lockedUntil: null },
        });

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          rememberMe: credentials?.rememberMe !== "0",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.name = (user as { name?: string | null }).name ?? null;
        token.role = (user as { role?: string }).role ?? "user";
      }
      // token.name が未設定の旧JWTのみDBから1回補完（null は再クエリしない）
      if (token.name === undefined && token.id && !user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          select: { name: true },
        });
        token.name = dbUser?.name ?? null;
      }
      // Google OAuth: DBからid・role・nameを取得
      if (account?.provider === "google" && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, name: true, role: true },
        });
        if (dbUser) {
          token.id = String(dbUser.id);
          token.role = dbUser.role;
          token.name = dbUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string | null) ?? null;
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
});
