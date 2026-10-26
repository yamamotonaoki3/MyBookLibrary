// proxy とクライアントで共有する公開認証画面。従来の前方一致判定を維持する。
// Edge Runtime / クライアントの両方から使うため、サーバー依存を持たせない。
export const PUBLIC_AUTH_PATHS = ["/login", "/register", "/forgot-password"] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));
}
