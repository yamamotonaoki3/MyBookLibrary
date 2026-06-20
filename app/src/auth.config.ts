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
        session.user.rememberMe = (token.rememberMe as boolean) ?? true;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { nextUrl, cookies } = request;
      const isLoggedIn = !!auth?.user;
      const isPublicPath =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register") ||
        nextUrl.pathname.startsWith("/forgot-password") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/cron/") ||
        nextUrl.pathname === "/manifest.json" ||
        nextUrl.pathname.startsWith("/icons/");

      if (isLoggedIn) {
        // rememberMe=false かつ session-active クッキーなし → ブラウザ再起動と判断してログアウト
        const rememberMe =
          (auth.user as { rememberMe?: boolean }).rememberMe ?? true;
        if (rememberMe === false) {
          const sessionActive = cookies.get("session-active")?.value;
          if (!sessionActive) {
            const res = NextResponse.redirect(
              new URL("/login", nextUrl.origin)
            );
            res.cookies.delete("authjs.session-token");
            res.cookies.delete("__Secure-authjs.session-token");
            return res;
          }
        }

        if (nextUrl.pathname.startsWith("/login")) {
          return NextResponse.redirect(new URL("/", nextUrl.origin));
        }
      }

      if (isPublicPath) return true;
      if (!isLoggedIn) return false;

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
