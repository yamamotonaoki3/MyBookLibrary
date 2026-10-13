/**
 * デプロイ済みの環境（既定はステージング）に対する疎通確認（npm run smoke:remote）。
 *
 * ステージングの Worker に HTTP で接続し、次を確認する。
 *   - 画面の表示、未認証のリダイレクト（proxy）、認証プロバイダーの設定（Google のコールバック URL）
 *   - Credentials ログイン、セッション、保護ページ
 *   - 本の検索 API（楽天ブックス・DB）
 *   - Cron API が Bearer なしを拒否すること
 *
 * 接続先は STAGING_URL（既定: https://mybooklibrary-staging.nyproducts.workers.dev）。https で、既定の origin と完全一致する URL にしか、
 * 認証情報を送らない（本番などへの誤接続を防ぐ）。別の URL は SMOKE_ALLOW_NON_DEFAULT=1 で明示的に許可する。
 * ログインには、ステージング専用のテストユーザー（架空のデータ）の STAGING_SMOKE_EMAIL / STAGING_SMOKE_PASSWORD を使う。
 * STAGING_CRON_SECRET（ステージングの CRON_SECRET）があれば、Cron API の手動実行（Bearer 付き）も確認する。
 * 環境変数で渡すか、STAGING_SMOKE_ENV_FILE（既定: ホームディレクトリの .mbl-staging-smoke.env。リポジトリの外）から読む。値はログに出さない。
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_URL = "https://mybooklibrary-staging.nyproducts.workers.dev";

/**
 * 接続先を検証して origin を返す。認証情報を送るため、https の、ステージングの URL（既定の origin と完全一致）だけを許可する。
 * 別の URL（ステージングを作り直した場合など）は、SMOKE_ALLOW_NON_DEFAULT=1 で明示的に許可する。
 * URL にユーザー情報・クエリ・フラグメントがあれば、値がログに出ないよう拒否する。
 */
function resolveBase() {
  let url;
  try {
    url = new URL(process.env.STAGING_URL ?? DEFAULT_URL);
  } catch {
    throw new Error("STAGING_URL が URL として不正です。");
  }
  if (url.protocol !== "https:") throw new Error("接続先は https である必要があります（認証情報を送るため）。");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("STAGING_URL にユーザー情報・クエリ・フラグメントは指定できません。");
  }
  if (url.origin !== new URL(DEFAULT_URL).origin && process.env.SMOKE_ALLOW_NON_DEFAULT !== "1") {
    throw new Error(`接続先 ${url.origin} は既定のステージングの URL ではありません。意図した接続先なら SMOKE_ALLOW_NON_DEFAULT=1 を指定してください。`);
  }
  return url.origin;
}
let BASE = DEFAULT_URL;

function loadCredentials() {
  const envFile = process.env.STAGING_SMOKE_ENV_FILE ?? path.join(os.homedir(), ".mbl-staging-smoke.env");
  const fromFile = {};
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0) fromFile[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  }
  return {
    email: process.env.STAGING_SMOKE_EMAIL ?? fromFile.STAGING_SMOKE_EMAIL,
    password: process.env.STAGING_SMOKE_PASSWORD ?? fromFile.STAGING_SMOKE_PASSWORD,
    cronSecret: process.env.STAGING_CRON_SECRET ?? fromFile.STAGING_CRON_SECRET,
  };
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "NG "} ${name}${ok || !detail ? "" : ` … ${detail}`}`);
}

/** Cookie を保持しながらリダイレクトを追わずにリクエストする、簡易クライアント。 */
function createClient() {
  const jar = new Map();
  return {
    async request(pathname, init = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const response = await fetch(`${BASE}${pathname}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
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

async function main() {
  BASE = resolveBase();
  const { email, password, cronSecret } = loadCredentials();
  if (!email || !password) {
    throw new Error("STAGING_SMOKE_EMAIL / STAGING_SMOKE_PASSWORD が未設定です（環境変数、または STAGING_SMOKE_ENV_FILE で指定）。");
  }
  console.log(`接続先: ${BASE}`);

  // 1. 画面と proxy
  const anonymous = createClient();
  const loginPage = await anonymous.request("/login");
  check("ログイン画面が表示される（200）", loginPage.status === 200, `status=${loginPage.status}`);
  const redirect = await anonymous.request("/books");
  check(
    "未認証で保護ページへ行くとログインへリダイレクトされる（proxy）",
    redirect.status === 307 && (redirect.headers.get("location") ?? "").includes("/login"),
    `status=${redirect.status}`
  );

  // 2. 認証プロバイダー
  const providers = await (await anonymous.request("/api/auth/providers")).json();
  check(
    "Google のコールバック URL が接続先の URL になっている",
    providers?.google?.callbackUrl === `${BASE}/api/auth/callback/google`,
    String(providers?.google?.callbackUrl)
  );
  check("Credentials のプロバイダーがある", Boolean(providers?.credentials));

  // 3. ログイン・セッション・保護ページ
  const client = createClient();
  const csrf = await (await client.request("/api/auth/csrf")).json();
  // 誤ったパスワードでのログインは試さない（失敗が重なるとテストユーザーがロックされるため）
  const ok = await client.request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password }),
  });
  check("正しいパスワードでログインできる（302）", ok.status === 302 && !(ok.headers.get("location") ?? "").includes("error"), `status=${ok.status} location=${ok.headers.get("location") ?? ""}`);
  const session = await (await client.request("/api/auth/session")).json();
  check("セッションにログインしたユーザーが入る", session?.user?.email === email, "email が一致しません");
  const books = await client.request("/books");
  check("ログイン後は保護ページが表示される（200）", books.status === 200, `status=${books.status}`);

  // 4. 本の検索（楽天ブックス・DB）
  const search = await client.request(`/api/books/search?q=${encodeURIComponent("吾輩は猫である")}&type=title`);
  const searchBody = search.status === 200 ? await search.json() : null;
  // 楽天が 0 件・失敗のときは国立国会図書館（NDL）の結果に切り替わるため、結果があるだけでは楽天の確認にならない。
  // NDL の結果は size が空・書影なしで返るため、size か書影のある結果を、楽天ブックス由来とみなして数える。
  const items = Array.isArray(searchBody?.items) ? searchBody.items : [];
  const rakutenItems = items.filter((item) => item.size !== "" || item.coverImageUrl !== null);
  check("本の検索 API が楽天ブックスの結果を返す（NDL の結果は数えない）", search.status === 200 && rakutenItems.length > 0, `status=${search.status} items=${items.length} rakuten=${rakutenItems.length}`);

  // 5. Cron API
  const cron = await anonymous.request("/api/cron/check-new-books");
  check("Cron API は Bearer なしを拒否する（401）", cron.status === 401, `status=${cron.status}`);
  if (cronSecret) {
    // ステージングの Cron Trigger は無効のため、Cron の処理（新刊チェック）は、この HTTP 呼び出しで手動実行して確認する
    const run = await anonymous.request("/api/cron/check-new-books", { headers: { authorization: `Bearer ${cronSecret}` } });
    const runBody = run.status === 200 ? await run.json() : null;
    check("Cron API を Bearer 付きで手動実行できる（200）", run.status === 200 && runBody?.ok === true, `status=${run.status}`);
  } else {
    console.log("-- STAGING_CRON_SECRET が未設定のため、Cron の手動実行はスキップしました");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? `\nすべて成功しました（${results.length} 件）。` : `\n${failed.length} 件失敗しました。`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
