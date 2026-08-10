/**
 * 外部通信ガードの実体。`jest.setup.network.ts`（beforeEach での既定適用）と
 * `fetchMock.ts`（`restoreFetch` の戻り先）の両方から参照する共有モジュール。
 *
 * `restoreFetch()` の戻り先を「モジュール読み込み時点の本物の fetch」ではなく
 * このガードにするための切り出し。本物に戻すと、モックを解除した後の
 * コードパスで実リクエストが漏れる可能性が残ってしまう。
 */
export function networkGuard(input: unknown): never {
  const url =
    typeof input === "string" ? input : (input as { url?: string })?.url ?? String(input);
  throw new Error(
    `テスト中に外部通信が発生しました: ${url}\n` +
      "外部APIを呼ぶコードをテストする場合は、src/__tests__/helpers/fetchMock.ts の " +
      "mockFetchJson 等で global.fetch をモックしてください。"
  );
}

/** ガードの `jest.fn()` インスタンスを新規に作る。 */
export function createNetworkGuardFetch(): typeof globalThis.fetch {
  return jest.fn(networkGuard) as unknown as typeof globalThis.fetch;
}
