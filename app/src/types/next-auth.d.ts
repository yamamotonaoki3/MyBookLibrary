import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      /** ログイン保持の有無。保持なし（false）のセッションだけ、ブラウザ起動中の目印の Cookie を必要とする（#782） */
      rememberMe?: boolean;
      mustChangePassword: boolean;
    };
  }
}
