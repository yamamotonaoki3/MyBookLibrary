/**
 * Google ログインのプロバイダーは、デモ環境（DEMO_MODE=true）では、認証情報が設定されていても有効にしない（#721）。
 * 画面のボタンを隠しても、Auth.js への直接のリクエストで、実在のアカウントが作られるのを防ぐ。
 */
jest.mock("@/lib/prisma");
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
jest.mock("next-auth", () => jest.fn(() => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() })));
jest.mock("next-auth/providers/credentials", () => jest.fn((config: unknown) => ({ id: "credentials", config })));
jest.mock("next-auth/providers/google", () => jest.fn(() => ({ id: "google" })));
jest.mock("../../../auth.config", () => ({ authConfig: {} }));

const KEYS = ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "DEMO_MODE"] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function providerIds(): string[] {
  let ids: string[] = [];
  jest.isolateModules(() => {
    const NextAuth = jest.requireMock("next-auth") as jest.Mock;
    NextAuth.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- モジュールを毎回読み直し、その時点の環境変数でプロバイダーを作らせる
    require("@/auth");
    ids = (NextAuth.mock.calls[0][0].providers as { id: string }[]).map((provider) => provider.id);
  });
  return ids;
}

describe("auth の providers（Google ログイン）", () => {
  it("認証情報があり、デモ環境でなければ、Google を有効にする（従来どおり）", () => {
    process.env.AUTH_GOOGLE_ID = "id-for-test";
    process.env.AUTH_GOOGLE_SECRET = "secret-for-test";
    delete process.env.DEMO_MODE;

    expect(providerIds()).toEqual(["google", "credentials"]);
  });

  it("デモ環境（DEMO_MODE=true）では、認証情報があっても Google を有効にしない", () => {
    process.env.AUTH_GOOGLE_ID = "id-for-test";
    process.env.AUTH_GOOGLE_SECRET = "secret-for-test";
    process.env.DEMO_MODE = "true";

    expect(providerIds()).toEqual(["credentials"]);
  });

  it("認証情報がなければ、Google は有効にならない", () => {
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    delete process.env.DEMO_MODE;

    expect(providerIds()).toEqual(["credentials"]);
  });
});
