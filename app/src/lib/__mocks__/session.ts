/**
 * `@/lib/session` の手動モック（Jest manual mock）。
 *
 * テストファイルで `jest.mock("@/lib/session")` と書くとこのファイルが使われる。
 * 認可ガードを通した先のロジックを検証したい API 結合テストで使う。
 *
 * 戻り値の組み立ては `src/__tests__/helpers/sessionMock.ts` のヘルパーを使う。
 */

export const getAuthenticatedUserId = jest.fn();
export const requireAdminSession = jest.fn();
