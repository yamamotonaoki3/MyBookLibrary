import { randomBytes } from "node:crypto";
import { CHECK_NEW_BOOKS_PATH, createScheduledHandler, type CronEnv } from "@/lib/cronScheduler";

// 秘密情報の検査（Gitleaks）の誤検知を避けるため、テスト用の値はリテラルで書かず実行時に生成する
const SECRET = `s${randomBytes(12).toString("hex")}`;
const controller = { cron: "0 0 * * *" };

function setup(response: Response | Error = new Response('{"ok":true,"created":2}', { status: 200 })) {
  const appFetch = jest.fn<Promise<Response>, [Request, CronEnv, unknown]>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const waitUntil = jest.fn<void, [Promise<unknown>]>();
  const handler = createScheduledHandler(appFetch);
  return { appFetch, waitUntil, handler, ctx: { waitUntil } };
}

describe("createScheduledHandler", () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("新刊チェック API を Bearer 認証つきで内部呼び出しする", async () => {
    const { appFetch, waitUntil, handler, ctx } = setup();
    const env: CronEnv = { CRON_SECRET: SECRET, CRON_TARGET_ORIGIN: "https://books.example.com" };

    await handler(controller, env, ctx);
    await waitUntil.mock.calls[0][0];

    expect(appFetch).toHaveBeenCalledTimes(1);
    const [request, passedEnv] = appFetch.mock.calls[0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(`https://books.example.com${CHECK_NEW_BOOKS_PATH}`);
    expect(request.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(passedEnv).toBe(env);
  });

  it("実行はバックグラウンド（waitUntil）で完了まで待たれる", async () => {
    const { waitUntil, handler, ctx } = setup();

    await handler(controller, { CRON_SECRET: SECRET }, ctx);

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("origin が未設定なら http://localhost を使う", async () => {
    const { appFetch, waitUntil, handler, ctx } = setup();

    await handler(controller, { CRON_SECRET: SECRET }, ctx);
    await waitUntil.mock.calls[0][0];

    expect(appFetch.mock.calls[0][0].url).toBe(`http://localhost${CHECK_NEW_BOOKS_PATH}`);
  });

  it("CRON_SECRET が未設定なら API を呼ばずに失敗する", async () => {
    const { appFetch, waitUntil, handler, ctx } = setup();

    await expect(handler(controller, {}, ctx)).rejects.toThrow("CRON_SECRET is not configured");

    expect(appFetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("API が 2xx 以外を返したら、実行を失敗として扱う", async () => {
    const { waitUntil, handler, ctx } = setup(new Response('{"error":"Unauthorized"}', { status: 401 }));

    await handler(controller, { CRON_SECRET: SECRET }, ctx);

    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow("cron failed: 401");
  });

  it("API 呼び出しが例外になったら、実行を失敗として扱う", async () => {
    const { waitUntil, handler, ctx } = setup(new Error("接続できません"));

    await handler(controller, { CRON_SECRET: SECRET }, ctx);

    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow("接続できません");
  });

  it("ログに CRON_SECRET の値を出さない", async () => {
    const { waitUntil, handler, ctx } = setup(new Response("失敗", { status: 500 }));

    await handler(controller, { CRON_SECRET: SECRET }, ctx);
    await waitUntil.mock.calls[0][0].catch(() => undefined);
    await handler(controller, {}, ctx).catch(() => undefined);

    const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join("\n");
    expect(output).not.toContain(SECRET);
    expect(output).toContain('"status":500');
  });
});
