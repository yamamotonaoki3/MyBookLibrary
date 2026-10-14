/**
 * デモ環境の保護（DEMO_MODE、#721）。有効なときだけ、禁止する操作が 403 になり、無効なら従来どおり動くことを確認する。
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/demo/resetDemo", () => ({ resetDemoEnvironment: jest.fn() }));

import { auth } from "@/auth";
import { prismaMock } from "../../helpers/prismaMock";
import { resetDemoEnvironment } from "@/lib/demo/resetDemo";
import { isDemoMode } from "@/lib/demoMode";
import { requireAdminSession } from "@/lib/session";

const authMock = auth as unknown as jest.Mock;
const resetMock = jest.mocked(resetDemoEnvironment);

const originalEnv = { DEMO_MODE: process.env.DEMO_MODE, CRON_SECRET: process.env.CRON_SECRET };
afterEach(() => {
  if (originalEnv.DEMO_MODE === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalEnv.DEMO_MODE;
  if (originalEnv.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalEnv.CRON_SECRET;
});
beforeEach(() => {
  jest.clearAllMocks();
  authMock.mockResolvedValue(null);
});

describe("isDemoMode", () => {
  it('"true" のときだけ有効（未設定・それ以外は無効）', () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
    for (const value of ["", "false", "1", "TRUE", "yes"]) {
      process.env.DEMO_MODE = value;
      expect(isDemoMode()).toBe(false);
    }
    process.env.DEMO_MODE = "true";
    expect(isDemoMode()).toBe(true);
  });
});

type Handler = (req: never) => Promise<Response>;
const FORBIDDEN_ROUTES: { name: string; load: () => Promise<Handler>; disabledStatus: number }[] = [
  { name: "POST /api/user/change-password（パスワード変更）", load: async () => (await import("@/app/api/user/change-password/route")).POST as Handler, disabledStatus: 401 },
  { name: "POST /api/user/secret-word（合言葉の変更）", load: async () => (await import("@/app/api/user/secret-word/route")).POST as Handler, disabledStatus: 401 },
  { name: "DELETE /api/user/delete（退会）", load: async () => (await import("@/app/api/user/delete/route")).DELETE as Handler, disabledStatus: 401 },
  { name: "POST /api/auth/reset-password（パスワードの再設定）", load: async () => (await import("@/app/api/auth/reset-password/route")).POST as Handler, disabledStatus: 400 },
  { name: "POST /api/auth/register（新規登録）", load: async () => (await import("@/app/api/auth/register/route")).POST as Handler, disabledStatus: 400 },
  { name: "GET /api/admin/ndl-search（管理者の画面の検索）", load: async () => (await import("@/app/api/admin/ndl-search/route")).GET as Handler, disabledStatus: 401 },
  { name: "GET /api/admin/book-enrichment/tick（書誌補完の再開）", load: async () => (await import("@/app/api/admin/book-enrichment/tick/route")).GET as Handler, disabledStatus: 500 },
  { name: "POST /api/contact（問い合わせ）", load: async () => (await import("@/app/api/contact/route")).POST as Handler, disabledStatus: 401 },
];

describe.each(FORBIDDEN_ROUTES)("$name", ({ load, disabledStatus }) => {
  it("DEMO_MODE=true → 403（DEMO_MODE）。認証・DB には触れない", async () => {
    process.env.DEMO_MODE = "true";
    const handler = await load();

    const res = await handler((new NextRequest("http://localhost/api/test", { method: "POST", body: "{}" }) as unknown) as never);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_MODE" });
    expect(authMock).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("DEMO_MODE が無効なら、従来どおり動く（デモの 403 にならない）", async () => {
    delete process.env.DEMO_MODE;
    const handler = await load();

    const res = await handler(((new NextRequest("http://localhost/api/test", { method: "POST", body: "{}" })) as unknown) as never);

    expect(res.status).toBe(disabledStatus);
    expect(await res.json()).not.toMatchObject({ code: "DEMO_MODE" });
  });
});

describe("requireAdminSession（管理者の API の共通の認可）", () => {
  it("DEMO_MODE=true → 管理者のセッションでも 403。認証には触れない", async () => {
    process.env.DEMO_MODE = "true";
    authMock.mockResolvedValue({ user: { id: "1", role: "admin" } });

    const result = await requireAdminSession();

    expect(result.userId).toBeNull();
    expect(result.error?.status).toBe(403);
    expect(await result.error?.json()).toMatchObject({ code: "DEMO_MODE" });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("DEMO_MODE が無効なら、従来どおり（未認証は 401）", async () => {
    delete process.env.DEMO_MODE;

    const result = await requireAdminSession();

    expect(result.error?.status).toBe(401);
  });
});

describe("GET /api/cron/reset-demo（デモの定期的な初期化）", () => {
  let GET: (req: NextRequest) => Promise<Response>;
  const SECRET = "test-cron-secret-1234";
  const request = (authorization?: string) => new NextRequest("http://localhost/api/cron/reset-demo", { headers: authorization ? { authorization } : {} });

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/cron/reset-demo/route"));
  });

  it("デモ環境でなければ 404（初期化は動かない）", async () => {
    delete process.env.DEMO_MODE;
    process.env.CRON_SECRET = SECRET;

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(404);
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("Bearer がなければ 401、誤っていても 401（初期化は動かない）", async () => {
    process.env.DEMO_MODE = "true";
    process.env.CRON_SECRET = SECRET;

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong-secret-value"))).status).toBe(401);
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("CRON_SECRET が未設定・短ければ 500（初期化は動かない）", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.CRON_SECRET;
    expect((await GET(request("Bearer x"))).status).toBe(500);
    process.env.CRON_SECRET = "short";
    expect((await GET(request("Bearer short"))).status).toBe(500);
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("デモ環境で Bearer が正しければ、初期化して件数だけを返す", async () => {
    process.env.DEMO_MODE = "true";
    process.env.CRON_SECRET = SECRET;
    resetMock.mockResolvedValue({ users: 8, counts: { users: 8, reviews: 12 } });

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, users: 8, counts: { users: 8, reviews: 12 } });
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("初期化が失敗したら 500。例外の内容（値を含み得る）は応答に含めない", async () => {
    process.env.DEMO_MODE = "true";
    process.env.CRON_SECRET = SECRET;
    resetMock.mockRejectedValue(new Error("secret-detail-should-not-leak"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(request(`Bearer ${SECRET}`));

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret-detail");
    errorSpy.mockRestore();
  });
});
