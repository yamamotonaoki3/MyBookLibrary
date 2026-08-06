/**
 * `@/auth`（NextAuth 本体）の手動モック（Jest manual mock）。
 *
 * テストファイルで `jest.mock("@/auth")` と書くとこのファイルが使われる。
 * 実体を読み込むと NextAuth の初期化・Prisma アダプタ・環境変数が絡むため、
 * セッションだけを差し替えたい API 結合テストではこのモックを使う。
 *
 * セッションの組み立ては `src/__tests__/helpers/authMock.ts` のヘルパーを使う。
 */

export const auth = jest.fn();
export const signIn = jest.fn();
export const signOut = jest.fn();
export const handlers = { GET: jest.fn(), POST: jest.fn() };
