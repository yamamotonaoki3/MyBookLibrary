import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  matcher: [
    // api/auth（Auth.js のルート）は proxy を通さない。これらは認証不要の公開パスで、ルートハンドラが自前で
    // 認証・Cookie の設定を行う。OpenNext（Cloudflare）では proxy の Cookie がルートの Cookie の後ろに付き、
    // CSRF トークンが食い違って MissingCSRF になるため（docs/cloudflare-d1-migration-plan.md §4-7）。
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$).*)",
  ],
};
