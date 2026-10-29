import { handlers } from "@/auth";
import { clearSignedOutMarkerOnLogin, sessionRequestIsSignedOut } from "@/lib/signedOutMarker";

type Handler = (request: Request) => Promise<Response>;

// ログイン成功のとき、ログアウト済みの目印を消す（#784）
const withMarkerCleanup = (handler: Handler): Handler => async (request) => {
  if (sessionRequestIsSignedOut(request.method, new URL(request.url).pathname, request.headers.get("cookie"))) {
    return Response.json(null);
  }
  return clearSignedOutMarkerOnLogin(request, await handler(request));
};

export const GET = withMarkerCleanup(handlers.GET as Handler);
export const POST = withMarkerCleanup(handlers.POST as Handler);
