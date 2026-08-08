import { NextRequest } from "next/server";

/**
 * Route Handler に渡すリクエスト／コンテキストの組み立てヘルパー。
 *
 * Next 16 では動的セグメントの `params` が Promise になっているため、
 * その扱いを `routeCtx` に閉じ込めて各テストに散らさないようにしている。
 */

const BASE_URL = "http://localhost";

/** 相対パスを絶対URLに正規化する。 */
function toUrl(path: string): string {
  return path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** JSON ボディ付きのリクエストを作る（既定は POST）。 */
export function jsonRequest(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = "POST", body, headers = {} } = options;
  return new NextRequest(toUrl(path), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** ボディなしのリクエストを作る（既定は GET）。クエリはオブジェクトでも渡せる。 */
export function getRequest(
  path: string,
  searchParams?: Record<string, string | number | boolean>,
  options: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const url = new URL(toUrl(path));
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return new NextRequest(url, { method: options.method ?? "GET", headers: options.headers });
}

/**
 * Route Handler の第2引数（動的セグメント）を作る。
 * Next 16 の `params` は Promise なので、そのラップをここに集約する。
 */
export function routeCtx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
