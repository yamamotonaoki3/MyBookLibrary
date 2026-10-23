import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { authConfig } from "../../auth.config";

// 実ライブラリを独立したプロセスで読み、設定不備を意図的に起こす。
// 環境の実値やAuth.jsの設定エラーログは出力しない。
delete process.env.AUTH_SECRET;
delete process.env.NEXTAUTH_SECRET;
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;
let exposedAuth = "not-called";
const broken = NextAuth({
  providers: [],
  secret: "",
  trustHost: true,
  logger: { error() {} },
  callbacks: {
    authorized({ auth }) {
      exposedAuth = auth;
      return !!auth;
    },
  },
});
// authをmiddlewareとして呼ぶ実行時APIを検証する。ここではeventを参照しない。
const event = {};
const brokenResponse = await broken.auth(new NextRequest("http://localhost/books"), event);
const guarded = NextAuth({
  ...authConfig,
  secret: "",
  trustHost: true,
  logger: { error() {} },
});
const guardedResponse = await guarded.auth(new NextRequest("http://localhost/books"), event);
if (!(brokenResponse instanceof Response) || !(guardedResponse instanceof Response)) {
  throw new Error("Auth middleware did not return a response");
}
console.log(JSON.stringify({
  configurationErrorAuth: exposedAuth,
  configurationErrorStatus: brokenResponse.status,
  appGuardStatus: guardedResponse.status,
  appGuardLocation: guardedResponse.headers.get("location"),
}));
