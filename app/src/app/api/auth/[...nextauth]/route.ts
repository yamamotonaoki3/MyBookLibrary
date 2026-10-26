import { handlers } from "@/auth";
import { clearSignedOutMarkerOnLogin } from "@/lib/signedOutMarker";

type Handler = (request: Request) => Promise<Response>;

// ログイン成功のとき、ログアウト済みの目印を消す（#784）
const withMarkerCleanup = (handler: Handler): Handler => async (request) => clearSignedOutMarkerOnLogin(request, await handler(request));

export const GET = withMarkerCleanup(handlers.GET as Handler);
export const POST = withMarkerCleanup(handlers.POST as Handler);
