jest.mock("@/auth", () => ({ handlers: { GET: jest.fn(), POST: jest.fn() } }));

import { handlers } from "@/auth";
import { GET, POST } from "@/app/api/auth/[...nextauth]/route";
import { SIGNED_OUT_COOKIE } from "@/lib/sessionMarkers";

describe("Auth.js route のログアウト済み判定", () => {
  beforeEach(() => {
    jest.mocked(handlers.GET).mockResolvedValue(Response.json({ user: { id: "testuser_1" } }));
    jest.mocked(handlers.POST).mockResolvedValue(Response.json({ ok: true }));
  });

  it.each([`${SIGNED_OUT_COOKIE}=1`, `other=x; ${SIGNED_OUT_COOKIE}=; last=y`])("目印ありのGET sessionはnull JSONを返しCookieを発行しない: %s", async (cookie) => {
    const response = await GET(new Request("https://example.com/api/auth/session?x=1", { headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(handlers.GET).not.toHaveBeenCalled();
  });

  it.each([undefined, `prefix_${SIGNED_OUT_COOKIE}=1`, `other=${SIGNED_OUT_COOKIE}=1`])("目印なしでは従来のハンドラを呼ぶ: %s", async (cookie) => {
    const request = new Request("https://example.com/api/auth/session", { headers: cookie ? { cookie } : {} });
    const response = await GET(request);
    expect(await response.json()).toEqual({ user: { id: "testuser_1" } });
    expect(handlers.GET).toHaveBeenCalledWith(request);
  });

  it.each(["signin", "callback/credentials", "csrf", "signout", "session/other"])("別パス %s に影響しない", async (path) => {
    const request = new Request(`https://example.com/api/auth/${path}`, { headers: { cookie: `${SIGNED_OUT_COOKIE}=1` } });
    await GET(request);
    expect(handlers.GET).toHaveBeenCalledWith(request);
  });

  it("POST sessionに影響しない", async () => {
    const request = new Request("https://example.com/api/auth/session", { method: "POST", headers: { cookie: `${SIGNED_OUT_COOKIE}=1` } });
    await POST(request);
    expect(handlers.POST).toHaveBeenCalledWith(request);
  });
});
