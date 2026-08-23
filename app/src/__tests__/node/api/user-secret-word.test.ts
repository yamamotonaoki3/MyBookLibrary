jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asUser, asUnauthenticated } from "../../helpers/sessionMock";
import { makeUser } from "../../helpers/factories";

describe("GET /api/user/secret-word", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/user/secret-word/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("未認証 → 401を返す", async () => {
    asUnauthenticated();

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("パスワードログイン・秘密の言葉ともに未設定 → 両方falseを返す", async () => {
    asUser(1);
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: null, secretWordHash: null })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ hasPasswordLogin: false, hasSecretWord: false });
  });

  it("パスワードログインのみ設定済み → hasPasswordLoginのみtrueを返す", async () => {
    asUser(1);
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "hashed_password", secretWordHash: null })
    );

    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ hasPasswordLogin: true, hasSecretWord: false });
  });

  it("秘密の言葉も設定済み → 両方trueを返す", async () => {
    asUser(1);
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ password: "hashed_password", secretWordHash: "hashed_secret_word" })
    );

    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ hasPasswordLogin: true, hasSecretWord: true });
  });

  it("ユーザーが見つからない → 両方falseを返す", async () => {
    asUser(1);
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ hasPasswordLogin: false, hasSecretWord: false });
  });
});
