import { getAuthenticatedUserId, requireAdminSession } from "@/lib/session";

/**
 * 型付きの認可ガードモック（`@/lib/session` の手動モック）。
 *
 * 使い方:
 *
 * ```ts
 * jest.mock("@/lib/session");
 * import { asAdmin, asUser, asForbidden } from "../helpers/sessionMock";
 *
 * asAdmin(99);   // requireAdminSession が userId=99 を返す
 * asForbidden(); // requireAdminSession が 403 を返す
 * ```
 *
 * ガード自体の分岐（401/403 の出し分け）は `src/__tests__/lib/session.test.ts` で
 * 検証するため、API 結合テストではガードを通した先のロジックに集中する。
 */
export const getAuthenticatedUserIdMock = getAuthenticatedUserId as jest.Mock;
export const requireAdminSessionMock = requireAdminSession as jest.Mock;

if (typeof getAuthenticatedUserIdMock?.mockClear !== "function") {
  throw new Error(
    "sessionMock を使うテストファイルには jest.mock(\"@/lib/session\") が必要です。"
  );
}

/** 401 レスポンス（未認証）。ガードの戻り値に使う。 */
export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "認証が必要です" }), { status: 401 });
}

/** 403 レスポンス（権限不足）。ガードの戻り値に使う。 */
export function forbiddenResponse(): Response {
  return new Response(JSON.stringify({ error: "権限がありません" }), { status: 403 });
}

/** 両ガードが指定ユーザーとして通るようにする。 */
export function asUser(userId = 1): void {
  const ok = { userId, error: null };
  getAuthenticatedUserIdMock.mockResolvedValue(ok);
  requireAdminSessionMock.mockResolvedValue(ok);
}

/** 管理者として通るようにする（`asUser` の別名。意図を明示するために用意）。 */
export function asAdmin(userId = 99): void {
  asUser(userId);
}

/** 未認証（401）にする。 */
export function asUnauthenticated(): void {
  const ng = { userId: null, error: unauthorizedResponse() };
  getAuthenticatedUserIdMock.mockResolvedValue(ng);
  requireAdminSessionMock.mockResolvedValue(ng);
}

/** 権限不足（403）にする。`requireAdminSession` のみが失敗する状態。 */
export function asForbidden(userId = 1): void {
  getAuthenticatedUserIdMock.mockResolvedValue({ userId, error: null });
  requireAdminSessionMock.mockResolvedValue({ userId: null, error: forbiddenResponse() });
}
