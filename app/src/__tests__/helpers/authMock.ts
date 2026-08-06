import { auth } from "@/auth";

/**
 * 型付きの `auth()` モック（`@/auth` の手動モック）。
 *
 * 使い方:
 *
 * ```ts
 * jest.mock("@/auth");
 * import { authMock, signedIn, signedOut } from "../helpers/authMock";
 *
 * signedIn({ id: 1 });        // 一般ユーザーとしてログイン中
 * signedInAsAdmin({ id: 9 }); // 管理者としてログイン中
 * signedOut();                // 未ログイン
 * ```
 */
export const authMock = auth as unknown as jest.Mock;

if (typeof authMock?.mockClear !== "function") {
  throw new Error("authMock を使うテストファイルには jest.mock(\"@/auth\") が必要です。");
}

export type SessionUserOverrides = {
  id?: number | string;
  role?: "user" | "admin";
  name?: string;
  email?: string;
};

/** `auth()` がログイン中のセッションを返すようにする。 */
export function signedIn(overrides: SessionUserOverrides = {}): void {
  const { id = 1, role = "user", name = "テストユーザー", email = "user@example.com" } = overrides;
  authMock.mockResolvedValue({ user: { id: String(id), role, name, email } });
}

/** `auth()` が管理者セッションを返すようにする。 */
export function signedInAsAdmin(overrides: SessionUserOverrides = {}): void {
  signedIn({ id: 99, email: "admin@example.com", ...overrides, role: "admin" });
}

/** `auth()` が未ログイン（null）を返すようにする。 */
export function signedOut(): void {
  authMock.mockResolvedValue(null);
}
