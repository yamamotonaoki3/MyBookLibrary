import { sessionRequestIsSignedOut } from "@/lib/signedOutMarker";
import { SIGNED_OUT_COOKIE } from "@/lib/sessionMarkers";

describe("sessionRequestIsSignedOut", () => {
  it.each([`${SIGNED_OUT_COOKIE}=1`, `a=x; ${SIGNED_OUT_COOKIE}=; b=y`, `  ${SIGNED_OUT_COOKIE} =1`])("Cookie名を解析する: %s", (cookie) => {
    expect(sessionRequestIsSignedOut("GET", "/api/auth/session", cookie)).toBe(true);
  });
  it.each([null, "", `x_${SIGNED_OUT_COOKIE}=1`, `other=${SIGNED_OUT_COOKIE}=1`, SIGNED_OUT_COOKIE])("目印なし: %s", (cookie) => {
    expect(sessionRequestIsSignedOut("GET", "/api/auth/session", cookie)).toBe(false);
  });
  it("別パスとPOSTには影響しない", () => {
    expect(sessionRequestIsSignedOut("POST", "/api/auth/session", `${SIGNED_OUT_COOKIE}=1`)).toBe(false);
    expect(sessionRequestIsSignedOut("GET", "/api/auth/csrf", `${SIGNED_OUT_COOKIE}=1`)).toBe(false);
  });
});
