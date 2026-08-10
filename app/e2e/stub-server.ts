/**
 * 楽天ブックス・NDLサーチ・カーリルの最小スタブサーバー。
 *
 * E2E（Playwright）はサーバーサイド（Route Handler）から実行されるため、
 * Playwright の `page.route()` では外部通信を止められない。代わりに
 * `RAKUTEN_API_BASE` / `NDL_API_BASE` / `NDL_SRU_BASE` / `CALIL_API_BASE` を
 * このサーバーの URL に向けて起動する（`src/lib/{rakuten,ndl,calil}.ts` 参照）。
 *
 * フィクスチャは `e2e/fixtures/external/` の固定ファイルを返すのみで、
 * クエリパラメータによる出し分けは行わない（E2Eの検索結果を安定させるため）。
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

const FIXTURES_DIR = path.join(__dirname, "fixtures", "external");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
}

function send(res: import("node:http").ServerResponse, status: number, contentType: string, body: string) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

export function createStubServer() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    switch (url.pathname) {
      // 楽天ブックス書籍検索API
      case "/services/api/BooksBook/Search/20170404":
        return send(res, 200, "application/json; charset=utf-8", readFixture("rakuten-search.json"));

      // NDLサーチ OpenSearch
      case "/api/opensearch":
        return send(res, 200, "application/xml; charset=utf-8", readFixture("ndl-opensearch.xml"));

      // NDLサーチ SRU
      case "/api/sru":
        return send(res, 200, "application/xml; charset=utf-8", readFixture("ndl-sru.xml"));

      // カーリル 図書館検索
      case "/library":
        return send(res, 200, "application/json; charset=utf-8", readFixture("calil-library.json"));

      // カーリル 貸出状況確認（continue:0 を即返し、実APIの2秒ポーリングを再現しない）
      case "/check":
        return send(res, 200, "application/json; charset=utf-8", readFixture("calil-check.json"));

      default:
        return send(res, 404, "text/plain", `stub-server: unknown path ${url.pathname}`);
    }
  });
}

/**
 * `createStubServer()` を起動したポートから、アプリ側に渡すべき環境変数を組み立てる。
 *
 * `RAKUTEN_API_BASE` / `NDL_API_BASE` / `NDL_SRU_BASE` は各クライアントで
 * エンドポイントのフルパスとして使われるが、`CALIL_API_BASE` はホストのみで
 * `/library` `/check` はコード側で付加される（`src/lib/calil.ts` 参照）。
 * この違いを配線するたびに書き間違えないよう、ここに一元化する。
 */
export function stubEnv(port: number): Record<string, string> {
  const base = `http://localhost:${port}`;
  return {
    RAKUTEN_API_BASE: `${base}/services/api/BooksBook/Search/20170404`,
    NDL_API_BASE: `${base}/api/opensearch`,
    NDL_SRU_BASE: `${base}/api/sru`,
    CALIL_API_BASE: base,
  };
}

if (require.main === module) {
  const port = Number(process.env.STUB_SERVER_PORT ?? 3999);
  const server = createStubServer();
  server.listen(port, () => {
    console.log(`stub-server listening on http://localhost:${port}`);
  });
}
