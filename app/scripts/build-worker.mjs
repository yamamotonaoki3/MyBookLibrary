/**
 * Cloudflare Workers 向けの Worker をビルドする（npm run build:worker）。
 *
 *   1. DB_PROVIDER=d1・D1_RUNTIME=workers を指定して OpenNext でビルドする（next.config.ts が wasm を外部扱いにする）。
 *   2. OpenNext の出力（handler.mjs）の Prisma の wasm への参照を相対パスに書き換え、wasm を同じ場所へコピーする。
 *      wrangler は、この相対 import を CompiledWasm として Worker に同梱する。
 *
 * 2 の後処理が必要な理由: OpenNext のビルドは Prisma の wasm（query compiler）を Worker に同梱せず、
 * webpack は wasm を `fs` で読む形に変換するため、Workers 上では「ファイルが見つからない」で失敗する。
 * docs/archive/cloudflare-d1-migration-plan.md §4-7 を参照。ビルド・デプロイは CI（Linux）で行う前提
 * （Windows は OpenNext が公式にはサポートしていない）。
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM_NAME = "query_compiler_bg.wasm";
const HANDLER_DIR = path.join(appDir, ".open-next/server-functions/default");

/** handler.mjs の中の、wasm への絶対パスの動的 import を相対パスに書き換える。 */
export function rewriteWasmImports(source) {
  const pattern = /import\("[^"]*[\/]query_compiler_bg\.wasm"\)/g;
  const matches = source.match(pattern) ?? [];
  return { source: source.replace(pattern, `import("./${WASM_NAME}")`), count: matches.length };
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} が失敗しました（終了コード ${result.status}）`);
}

function main() {
  const openNextCli = path.join(appDir, "node_modules/@opennextjs/cloudflare/dist/cli/index.js");
  run(process.execPath, [openNextCli, "build"], { DB_PROVIDER: "d1", D1_RUNTIME: "workers" });

  const handlerPath = path.join(HANDLER_DIR, "handler.mjs");
  if (!existsSync(handlerPath)) throw new Error(`OpenNext の出力が見つかりません: ${handlerPath}`);

  const { source, count } = rewriteWasmImports(readFileSync(handlerPath, "utf8"));
  if (count === 0) {
    throw new Error(
      "handler.mjs に Prisma の wasm への import が見つかりません。ビルドの構成が変わった可能性があります（next.config.ts の externals を確認してください）。"
    );
  }
  writeFileSync(handlerPath, source);

  const wasmSource = path.join(appDir, "src/generated/prisma-d1", WASM_NAME);
  if (!existsSync(wasmSource)) {
    throw new Error(`D1 用の Prisma クライアントが生成されていません: ${wasmSource}（npm run prisma:generate:d1）`);
  }
  copyFileSync(wasmSource, path.join(HANDLER_DIR, WASM_NAME));

  console.log(`Worker をビルドしました（wasm の参照 ${count} 件を書き換え、${WASM_NAME} を同梱）。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
