/**
 * セッションの JWT の発行（#737）。ログイン保持（rememberMe）に応じた maxAge を、Auth.js の発行（encode）に渡すことを確認する。
 * Auth.js 自体は ESM のため Jest では読み込まず、encode を差し替える（実際の期限は、ビルドした Worker で別に確認する）。
 */
const mockEncode = jest.fn(async (params: { maxAge?: number }) => `encoded:${params.maxAge}`);
jest.mock("next-auth/jwt", () => ({ encode: (params: { maxAge?: number }) => mockEncode(params) }));

import { encodeSessionToken } from "@/lib/sessionJwt";

const DAY = 24 * 60 * 60;
const base = { secret: "test-only-secret", salt: "authjs.session-token" };

describe("encodeSessionToken", () => {
  it("ログイン保持なし → maxAge は 8 時間", async () => {
    await encodeSessionToken({ ...base, token: { id: "1", rememberMe: false }, maxAge: 30 * DAY });
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 8 * 60 * 60 }));
  });

  it.each([[{ id: "1", rememberMe: true }], [{ id: "1" }]])("保持あり・旧トークン（%p） → maxAge は渡された値（30 日）のまま", async (token) => {
    await encodeSessionToken({ ...base, token, maxAge: 30 * DAY });
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 30 * DAY }));
  });

  it("maxAge が渡されなければ、既定の 30 日（保持なしは 8 時間）", async () => {
    await encodeSessionToken({ ...base, token: { id: "1" } });
    expect(mockEncode).toHaveBeenLastCalledWith(expect.objectContaining({ maxAge: 30 * DAY }));
    await encodeSessionToken({ ...base, token: { id: "1", rememberMe: false } });
    expect(mockEncode).toHaveBeenLastCalledWith(expect.objectContaining({ maxAge: 8 * 60 * 60 }));
  });

  it("デモ環境の 15 分は、保持なしでも延ばさない", async () => {
    await encodeSessionToken({ ...base, token: { id: "1", rememberMe: false }, maxAge: 15 * 60 });
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ maxAge: 15 * 60 }));
  });

  it("token などの、ほかの引数は、そのまま渡す", async () => {
    const token = { id: "1", rememberMe: false };
    await encodeSessionToken({ ...base, token, maxAge: 30 * DAY });
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ token, ...base }));
  });
});
