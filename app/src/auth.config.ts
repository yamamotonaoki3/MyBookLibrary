import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { BROWSER_SESSION_COOKIE, SIGNED_OUT_COOKIE, isBrowserSessionAlive, sessionMaxAgeOption } from "@/lib/sessionPolicy";
import { encodeSessionToken } from "@/lib/sessionJwt";
import { isPublicAuthPath } from "@/lib/publicAuthPaths";

// Edge Runtimeで動作するlightweight設定（PrismaなしのJWT検証のみ）
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt", ...sessionMaxAgeOption() },
  // ログイン保持なしのセッションは、サーバー側でも 8 時間で切る（#737）
  jwt: { encode: encodeSessionToken },
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.role = (token.role as string) ?? "user";
        // proxy が、ログイン保持なしのセッションを、ブラウザを閉じたあとに未ログインとして扱うために使う（#782）
        session.user.rememberMe = (token.rememberMe as boolean | undefined) !== false;
      }
      return session;
    },
    authorized({ auth, request }) {
      const nextUrl = request.nextUrl;
      // ログイン保持なしは、ブラウザを閉じると消える目印の Cookie がなければ、未ログインとして扱う（#782）
      // ログアウト済みの目印があれば、トークンが有効でも未ログインとして扱う（復活したセッション Cookie を無効にする。#784）
      const isLoggedIn =
        !!auth?.user &&
        request.cookies?.get(SIGNED_OUT_COOKIE) === undefined &&
        isBrowserSessionAlive(auth.user.rememberMe, request.cookies?.get(BROWSER_SESSION_COOKIE) !== undefined);
      const isPublicPath =
        isPublicAuthPath(nextUrl.pathname) ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/cron/") ||
        // ルートが Bearer 認証を行う。Cloudflare の Cron / AWS の Lambda が Cookie なしで呼ぶため。
        nextUrl.pathname === "/api/admin/book-enrichment/tick" ||
        nextUrl.pathname === "/api/version" ||
        nextUrl.pathname === "/manifest.json" ||
        // SW registration/importScripts must work before login. Restrict to
        // generated root scripts, rather than allowing arbitrary .js paths.
        nextUrl.pathname === "/sw.js" ||
        /^\/(?:workbox|pwa-worker)-[a-f0-9]+\.js$/.test(nextUrl.pathname) ||
        nextUrl.pathname.startsWith("/icons/");

      if (isLoggedIn && nextUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }

      if (isPublicPath) return true;
      if (!isLoggedIn) return false;

      if (
        nextUrl.pathname.startsWith("/admin") &&
        // デモ環境（DEMO_MODE=true）では、管理者の画面を開かない（管理者の操作は API も拒否される）
        (process.env.DEMO_MODE === "true" || (auth.user as { role?: string })?.role !== "admin")
      ) {
        return NextResponse.redirect(new URL("/", nextUrl.origin));
      }

      return true;
    },
  },
  providers: [],
};
