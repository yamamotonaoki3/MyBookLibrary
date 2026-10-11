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
 * 外部APIが遅い状況を再現したいテストのため、NDL・楽天の応答遅延だけ
 * `/__stub/delay` で設定できる（`/__stub/reset` で戻す）。
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

// 外部APIが遅い状況を再現するための応答遅延（ms）。E2Eから `/__stub/delay` で設定し、`/__stub/reset` で戻す。
const delays = { ndl: 0, rakuten: 0 };

function sendAfterDelay(
  res: import("node:http").ServerResponse,
  delayMs: number,
  status: number,
  contentType: string,
  body: string
) {
  if (delayMs <= 0) return send(res, status, contentType, body);
  setTimeout(() => {
    // クライアントが先に切断（タイムアウト）していたら何もしない
    if (!res.destroyed && !res.writableEnded) send(res, status, contentType, body);
  }, delayMs);
}

export function createStubServer() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    switch (url.pathname) {
      // E2E用の制御: 例 /__stub/delay?target=ndl&ms=8000
      case "/__stub/delay": {
        const target = url.searchParams.get("target");
        const ms = Number(url.searchParams.get("ms") ?? 0);
        if ((target !== "ndl" && target !== "rakuten") || !Number.isFinite(ms) || ms < 0) {
          return send(res, 400, "text/plain", "invalid target or ms");
        }
        delays[target] = ms;
        return send(res, 200, "text/plain", "ok");
      }
      case "/__stub/reset":
        delays.ndl = 0;
        delays.rakuten = 0;
        return send(res, 200, "text/plain", "ok");

      // 楽天ブックス書籍検索API
      case "/services/api/BooksBook/Search/20170404":
        return sendAfterDelay(res, delays.rakuten, 200, "application/json; charset=utf-8", readFixture("rakuten-search.json"));

      // NDLサーチ OpenSearch
      case "/api/opensearch":
        return sendAfterDelay(res, delays.ndl, 200, "application/xml; charset=utf-8", readFixture("ndl-opensearch.xml"));

      // NDLサーチ SRU
      case "/api/sru":
        return sendAfterDelay(res, delays.ndl, 200, "application/xml; charset=utf-8", readFixture("ndl-sru.xml"));

      // カーリル 図書館検索
      case "/library":
        return send(res, 200, "application/json; charset=utf-8", readFixture("calil-library.json"));

      // カーリル 貸出状況確認（continue:0 を即返し、実APIの2秒ポーリングを再現しない）
      case "/check":
        return send(res, 200, "application/json; charset=utf-8", readFixture("calil-check.json"));

      // 書影のスタブ（1x1 PNG）。フィクスチャの largeImageUrl はこのパスを指す。
      // next/image がフェッチする際に実際の楽天CDNへ通信しないようにするため。
      case "/stub/dummy.jpg": {
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64"
        );
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(png);
      }

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
    // next.config.ts が next/image の remotePatterns に http://localhost:<port> を
    // 追加するかどうかの判定に使う（本番・開発の設定は変えない）。
    STUB_SERVER_PORT: String(port),
  };
}

if (require.main === module) {
  const port = Number(process.env.STUB_SERVER_PORT ?? 3999);
  const server = createStubServer();
  server.listen(port, () => {
    console.log(`stub-server listening on http://localhost:${port}`);
  });
}
