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
        if (token.sessionBound) {
          session.sessionBound = true;
        }
      }
      return session;
    },
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const sessionCookieMissing =
        auth?.sessionBound === true && !request.cookies.has("sessionBound");
      const effectivelyLoggedIn = isLoggedIn && !sessionCookieMissing;
      const isPublicPath =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register") ||
        nextUrl.pathname.startsWith("/forgot-password") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/cron/") ||
        nextUrl.pathname === "/manifest.json" ||
        nextUrl.pathname.startsWith("/icons/");

      if (effectivelyLoggedIn && nextUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }
      if (isPublicPath) return true;
      if (!effectivelyLoggedIn) return false;

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
