/**
 * デモ環境の、楽天ブックス API の確認（npm run smoke:demo-rakuten）。#720
 *
 * デモの Worker にデモの一般ユーザーでログインし、本の検索 API が、楽天ブックスの結果を返すことだけを確認する
 * （楽天の許可ドメインの登録、RAKUTEN_ALLOWED_ORIGIN、secret の確認。E2E と同じく、楽天 API の返答だけを見る）。
 *
 * 接続先は、デモの URL（https://mybooklibrary-demo.nyproducts.workers.dev）だけ。別の URL へは、認証情報を送らない。
 * ログインには、公開してよいデモ用のパスワード（src/lib/demo/seedPlan.ts の DEMO_USER_PASSWORD と同じ値）を使う。
 * 先に、デモ用 D1 へ、デモのデータの作成（npm run demo:seed -- seed ...）が済んでいること。
 * 出力は、結果（OK / NG）と件数だけ。
 */
const BASE = "https://mybooklibrary-demo.nyproducts.workers.dev";
const EMAIL = "demo_sakura@example.com";
// 公開してよい、デモ用の固定値（実アカウントの値ではない）。seedPlan.ts の DEMO_USER_PASSWORD と同じ。
const PASSWORD = "DemoPass123!";

const jar = new Map();

async function request(pathname, init = {}) {
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
}

async function main() {
  console.log(`接続先: ${BASE}`);
  const csrf = await (await request("/api/auth/csrf")).json();
  // 誤ったパスワードでのログインは試さない（失敗が重なると、ユーザーがロックされるため）
  const login = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD }),
  });
  const loggedIn = login.status === 302 && !(login.headers.get("location") ?? "").includes("error");
  console.log(`${loggedIn ? "OK " : "NG "} デモの一般ユーザーでログインできる${loggedIn ? "" : ` … status=${login.status}（デモのデータは作成済みか）`}`);
  if (!loggedIn) {
    process.exitCode = 1;
    return;
  }

  const search = await request(`/api/books/search?q=${encodeURIComponent("吾輩は猫である")}&type=title`);
  const body = search.status === 200 ? await search.json() : null;
  // 楽天が 0 件・失敗のときは国立国会図書館（NDL）の結果に切り替わるため、結果があるだけでは楽天の確認にならない。
  // NDL の結果は size が空・書影なしで返るため、size か書影のある結果を、楽天ブックス由来とみなして数える。
  const items = Array.isArray(body?.items) ? body.items : [];
  const rakutenItems = items.filter((item) => item.size !== "" || item.coverImageUrl !== null);
  const ok = search.status === 200 && rakutenItems.length > 0;
  console.log(`${ok ? "OK " : "NG "} 本の検索 API が楽天ブックスの結果を返す（NDL の結果は数えない） … status=${search.status} items=${items.length} rakuten=${rakutenItems.length}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
