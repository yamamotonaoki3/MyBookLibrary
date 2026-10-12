/**
 * ビルドした Worker のスモークテスト（npm run smoke:worker。先に npm run build:worker が必要）。
 *
 * ローカルの D1（miniflare）にマイグレーションとテスト用ユーザーを入れ、`wrangler dev --local` で Worker を起動して、
 * Workers 上で次が動くことを確認する。CI の worker ジョブでも実行する。
 *   - 画面の表示、proxy による未認証のリダイレクト
 *   - Prisma（D1 アダプタ + wasm）経由の Credentials ログイン、セッション、保護ページ、失敗時の D1 への書き込み
 *   - Cron Trigger（scheduled）からの新刊チェック API の呼び出し
 * 認証情報（パスワード・AUTH_SECRET・CRON_SECRET）は実行ごとにランダムに生成し、ログに出さない。
 * 本番・開発の D1 には接続しない（一時ディレクトリのローカル D1 のみ）。
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = path.join(appDir, "node_modules/wrangler/bin/wrangler.js");
const PORT = Number(process.env.SMOKE_PORT ?? 8788);
const BASE = `http://localhost:${PORT}`;
const DB_NAME = "mybooklibrary-db";
const EMAIL = "smoke-worker@example.com";

const random = () => randomBytes(18).toString("hex");
const password = `P${random()}!`;
const authSecret = random();
const cronSecret = random();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "NG "} ${name}${ok || !detail ? "" : ` … ${detail}`}`);
}

function wrangler(args, options = {}) {
  return execFileSync(process.execPath, [wranglerCli, ...args], { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

/** Cookie を保持しながらリダイレクトを追わずにリクエストする、簡易クライアント。 */
function createClient() {
  const jar = new Map();
  return {
    async request(pathname, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const response = await fetch(`${BASE}${pathname}`, {
        redirect: "manual",
        ...init,
        headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
      });
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);
        const value = pair.slice(index + 1);
        if (value === "" || /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(line)) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
  };
}

async function login(client, loginPassword) {
  const csrf = await (await client.request("/api/auth/csrf")).json();
  return client.request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: loginPassword }),
  });
}

/** ログの抜粋を、エラーメッセージに含めても安全なように、生成した秘密情報を伏せて返す。 */
function safeTail(logPath, length = 2000) {
  return [password, authSecret, cronSecret]
    .reduce((text, secret) => text.split(secret).join("[REDACTED]"), readFileSync(logPath, "utf8"))
    .slice(-length);
}

async function waitForReady(logPath, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error("wrangler dev が終了しました:\n" + safeTail(logPath));
    if (/Ready on/.test(readFileSync(logPath, "utf8"))) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("wrangler dev の起動がタイムアウトしました:\n" + safeTail(logPath));
}

/** 指定のポートで接続を受け付けているか（起動前の空き確認と、終了後の残り確認に使う）。 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

/**
 * 起動した wrangler dev を終了し、終了を待つ。期限を過ぎたら強制終了する。
 * Windows では、wrangler の子の workerd が親の終了後も残ってファイルを掴むことがあるため、
 * このスクリプト専用のポート（起動前に空いていることを確認済み）を待ち受けているプロセスだけを追加で止める。
 */
async function stop(child) {
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
    } else {
      child.kill("SIGTERM");
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 5000).unref();
    }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 8000))]);
  }
  if (process.platform === "win32" && (await isPortInUse(PORT))) {
    spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  if (await isPortInUse(PORT)) {
    throw new Error(`ポート ${PORT} は使用中です。SMOKE_PORT で別のポートを指定してください（使用中のプロセスは止めません）。`);
  }
  const workDir = mkdtempSync(path.join(os.tmpdir(), "mbl-worker-smoke-"));
  const logPath = path.join(workDir, "dev.log");
  let child;
  let logging = true; // 一時ディレクトリを消した後に、残ったプロセスのログで書き込みエラーにならないようにする
  try {
    // ローカル D1: マイグレーションの適用とテスト用ユーザーの登録
    wrangler(["d1", "migrations", "apply", DB_NAME, "--local", "--persist-to", workDir]);
    const hash = bcrypt.hashSync(password, 4);
    const seedPath = path.join(workDir, "seed.sql");
    writeFileSync(
      seedPath,
      `INSERT INTO users (name, email, role, password, created_at) VALUES ('スモーク確認', '${EMAIL}', 'user', '${hash}', '${new Date().toISOString()}');`
    );
    wrangler(["d1", "execute", DB_NAME, "--local", "--persist-to", workDir, "--file", seedPath]);

    // Worker の起動（値はローカルの変数として渡す）
    writeFileSync(logPath, "");
    child = spawn(
      process.execPath,
      [
        wranglerCli, "dev", "--local", "--port", String(PORT), "--persist-to", workDir, "--test-scheduled",
        "--var", `AUTH_SECRET:${authSecret}`, "--var", "AUTH_TRUST_HOST:true",
        "--var", `AUTH_URL:https://localhost:${PORT}`,
        "--var", `CRON_SECRET:${cronSecret}`, "--var", `CRON_TARGET_ORIGIN:${BASE}`,
      ],
      { cwd: appDir, stdio: ["ignore", "pipe", "pipe"] }
    );
    const append = (chunk) => {
      if (logging) writeFileSync(logPath, chunk, { flag: "a" });
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    await waitForReady(logPath, child);

    // 1. 画面と proxy
    const anonymous = createClient();
    const loginPage = await anonymous.request("/login");
    check("ログイン画面が表示される（200）", loginPage.status === 200, `status=${loginPage.status}`);
    const protectedRedirect = await anonymous.request("/books");
    check(
      "未認証で保護ページへ行くとログインへリダイレクトされる（proxy）",
      protectedRedirect.status === 307 && (protectedRedirect.headers.get("location") ?? "").includes("/login"),
      `status=${protectedRedirect.status}`
    );

    // 2. 失敗時の D1 への書き込み
    const wrong = await login(createClient(), `${password}x`);
    check("誤ったパスワードはログインできない", (wrong.headers.get("location") ?? "").includes("CredentialsSignin"), wrong.headers.get("location") ?? "");
    const failCount = JSON.parse(
      wrangler(["d1", "execute", DB_NAME, "--local", "--persist-to", workDir, "--json", "--command", `SELECT login_fail_count AS c FROM users WHERE email = '${EMAIL}'`])
    )[0].results[0].c;
    check("失敗回数が D1 に書き込まれる（Prisma + D1 アダプタ）", failCount === 1, `login_fail_count=${failCount}`);

    // 3. 正しいパスワードでのログイン・セッション・保護ページ
    const client = createClient();
    const ok = await login(client, password);
    check("正しいパスワードでログインできる（302 でトップへ）", ok.status === 302 && !(ok.headers.get("location") ?? "").includes("error"), ok.headers.get("location") ?? "");
    const session = await (await client.request("/api/auth/session")).json();
    check("セッションにログインしたユーザーが入る", session?.user?.email === EMAIL, JSON.stringify(session));
    const books = await client.request("/books");
    check("ログイン後は保護ページが表示される（200）", books.status === 200, `status=${books.status} location=${books.headers.get("location") ?? ""}`);

    // 4. Cron
    const withoutBearer = await anonymous.request("/api/cron/check-new-books");
    check("Cron API は Bearer なしを拒否する（401）", withoutBearer.status === 401, `status=${withoutBearer.status}`);
    const trigger = await fetch(`${BASE}/__scheduled?cron=0+0+*+*+*`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const log = readFileSync(logPath, "utf8");
    check("Cron Trigger（scheduled）が新刊チェック API を呼び出して成功する", trigger.status === 200 && /"msg":"cron finished"[^\n]*"status":200/.test(log), `trigger=${trigger.status}`);

    // 秘密情報をログに出していないこと
    check("ログにパスワード・AUTH_SECRET・CRON_SECRET が出ていない", ![password, authSecret, cronSecret].some((secret) => log.includes(secret)));
  } finally {
    if (child) await stop(child);
    logging = false;
    try {
      // Windows では、終了直後の workerd がファイルを掴んでいて削除に失敗することがあるため、少し待って再試行する
      rmSync(workDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
    } catch (error) {
      console.warn(`一時ディレクトリを削除できませんでした（検証結果には影響しません）: ${workDir}\n${error.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? `\nすべて成功しました（${results.length} 件）。` : `\n${failed.length} 件失敗しました。`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
