/**
 * 全 project 共通の外部通信ガード。
 *
 * 本アプリは楽天ブックス・NDLサーチ・カーリルの各APIを `global.fetch` で
 * 直叩きしており、モックし忘れると実リクエストが飛ぶ構造になっている。
 * ここで各テストの開始前に `fetch` を「呼ばれたら throw する」ガードへ
 * 差し替え、モック漏れを実リクエストではなくテスト失敗として即座に
 * 検出できるようにする。
 *
 * 外部APIクライアントをテストする側は `src/__tests__/helpers/fetchMock.ts` の
 * `mockFetchJson` 等で `global.fetch` を上書きして使う。
 */
import { createNetworkGuardFetch } from "./src/__tests__/helpers/networkGuard";

beforeEach(() => {
  globalThis.fetch = createNetworkGuardFetch();
});
