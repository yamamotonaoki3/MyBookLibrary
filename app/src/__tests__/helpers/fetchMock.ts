/**
 * `global.fetch` を差し替えるヘルパー。
 *
 * 楽天ブックス・NDLサーチ・カーリルはいずれも `global.fetch` で実エンドポイントを
 * 直叩きしているため、**テストから実リクエストを飛ばさないこと**が必須要件になる。
 * 外部APIを経由するテストは必ずこのヘルパーで fetch を差し替える。
 *
 * 使い方:
 *
 * ```ts
 * afterEach(restoreFetch);
 *
 * mockFetchJson({ Items: [] });                       // 単発
 * mockFetchSequence([{ json: a }, { json: b }]);      // 呼び出し順に返す（ポーリング検証など）
 * mockFetchNetworkError();                            // 通信エラー
 * ```
 *
 * 実際は `jest.setup.network.ts` の `beforeEach` が全テストの開始前に
 * ガードへ戻すため `restoreFetch()` は必須ではないが、同一テスト内で
 * モックを解除した後も fetch を呼ぶ可能性がある場合に備えて用意している。
 */
import { createNetworkGuardFetch } from "./networkGuard";

/** 1回分のレスポンス指定。`error` を指定すると fetch 自体が reject する。 */
export type MockResponseSpec = {
  json?: unknown;
  text?: string;
  status?: number;
  headers?: Record<string, string>;
  error?: Error;
};

function toResponse(spec: MockResponseSpec): Response {
  const { json, text, status = 200, headers = {} } = spec;
  if (json !== undefined) {
    return new Response(JSON.stringify(json), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }
  return new Response(text ?? "", { status, headers });
}

/** 現在の `global.fetch` をモックとして取得する（未差し替えならエラー）。 */
export function fetchMock(): jest.Mock {
  const current = globalThis.fetch as unknown as jest.Mock;
  if (typeof current?.mock !== "object") {
    throw new Error("fetch がモックされていません。mockFetchJson 等を先に呼んでください。");
  }
  return current;
}

/** 何度呼ばれても同じ JSON を返すようにする。 */
export function mockFetchJson(payload: unknown, options: { status?: number } = {}): jest.Mock {
  const mock = jest.fn(async () => toResponse({ json: payload, status: options.status }));
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

/** 何度呼ばれても同じテキスト（XML など）を返すようにする。 */
export function mockFetchText(body: string, options: { status?: number } = {}): jest.Mock {
  const mock = jest.fn(async () => toResponse({ text: body, status: options.status }));
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

/**
 * 呼び出し順にレスポンスを返す。
 * カーリルのポーリングや楽天のリトライのように、同じ関数が複数回 fetch する経路の検証に使う。
 * 指定を使い切った後は最後のレスポンスを返し続ける。
 */
export function mockFetchSequence(specs: MockResponseSpec[]): jest.Mock {
  if (specs.length === 0) throw new Error("mockFetchSequence には1件以上の指定が必要です。");

  let index = 0;
  const mock = jest.fn(async () => {
    const spec = specs[Math.min(index, specs.length - 1)];
    index += 1;
    if (spec.error) throw spec.error;
    return toResponse(spec);
  });
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

/** 通信エラー（fetch が reject）を再現する。 */
export function mockFetchNetworkError(message = "network error"): jest.Mock {
  const mock = jest.fn(async () => {
    throw new Error(message);
  });
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

/**
 * 解決しない fetch（タイムアウト）を再現する。
 * `jest.useFakeTimers()` と併用してタイムアウト処理を検証する。
 */
export function mockFetchTimeout(): jest.Mock {
  const mock = jest.fn(() => new Promise<Response>(() => {}));
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

/**
 * 差し替えた `global.fetch` を外部通信ガードへ戻す。
 *
 * **本物の fetch には戻さない。** 戻すとモック解除後のコードパスで
 * 実リクエストが漏れる可能性が残るため、常にガード（呼ばれたら throw する
 * 実装）へ戻す。
 */
export function restoreFetch(): void {
  globalThis.fetch = createNetworkGuardFetch();
}
