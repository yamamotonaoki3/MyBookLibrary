import { signOutWithMarker } from "@/lib/browserSessionCookie";
import { SIGNED_OUT_COOKIE, SIGNED_OUT_MARKER_SECONDS } from "@/lib/sessionMarkers";

const signOut = jest.fn();
jest.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

function hasCookie(name: string): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

describe("ログアウト（#784）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = `${SIGNED_OUT_COOKIE}=; Path=/; Max-Age=0`;
  });

  it("サインアウトを呼ぶ前に、ログアウト済みの目印を発行する（飛行中のセッション応答が先に復活させても、サーバーが未ログイン扱いにするため）", async () => {
    let markerWhenCalled: boolean | null = null;
    signOut.mockImplementation(async () => {
      markerWhenCalled = hasCookie(SIGNED_OUT_COOKIE);
    });
    await signOutWithMarker();
    expect(markerWhenCalled).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("目印の有効期間は、セッションの最大の有効期間（30日）に合わせる（書き戻された古いセッションが、あとから有効に戻らないため）", () => {
    expect(SIGNED_OUT_MARKER_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});
