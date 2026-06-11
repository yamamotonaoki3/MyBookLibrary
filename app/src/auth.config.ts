import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Edge Runtimeで動作するlightweight設定（PrismaなしのJWT検証のみ）
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.role = (token.role as string) ?? "user";
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPath =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register") ||
        nextUrl.pathname.startsWith("/forgot-password") ||
        nextUrl.pathname.startsWith("/api/auth");

      if (isPublicPath) return true;
      if (!isLoggedIn) return false; // /login へリダイレクト

      if (
        nextUrl.pathname.startsWith("/admin") &&
        (auth.user as { role?: string })?.role !== "admin"
      ) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }

      return true;
    },
  },
  providers: [],
};
