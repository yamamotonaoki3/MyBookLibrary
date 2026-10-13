/**
 * Worker のデプロイ（npm run deploy:staging / deploy:production）。
 *
 * リモート D1 にマイグレーションを適用してから、`wrangler deploy` で公開する。
 * バージョン名（package.json の version）とデプロイしたコミットを、Worker のバージョンのタグに付ける（例: `0.1.0-f64ec6c`。`/api/version` と `wrangler deployments list` に出る）。
 * コミットは、Workers Builds の WORKERS_CI_COMMIT_SHA、なければ手元の `git rev-parse HEAD` から取る。取れなければタグなしで公開する。
 *
 * 使い方: node scripts/deploy-worker.mjs <staging|production>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "staging" && target !== "production") {
  console.error("使い方: node scripts/deploy-worker.mjs <staging|production>");
  process.exit(1);
}

// 本番はトップレベルの設定、ステージングは env.staging を使う
const envArgs = target === "staging" ? ["--env", "staging"] : [];

const APP_VERSION = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version;

function commitTag() {
  const fromBuild = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromBuild && /^[0-9a-f]{7,40}$/i.test(fromBuild)) return fromBuild.slice(0, 7);
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

function wrangler(args) {
  // shell を使わず、引数をそのまま渡す（Windows でも Linux でも同じ動作）
  execFileSync(process.execPath, [WRANGLER, ...args], { stdio: "inherit", windowsHide: true });
}

wrangler(["d1", "migrations", "apply", "DB", "--remote", ...envArgs]);
const commit = commitTag();
const tag = commit ? `${APP_VERSION}-${commit}` : APP_VERSION;
console.log(`デプロイするバージョン: ${tag}`);
wrangler(["deploy", ...envArgs, "--tag", tag]);
