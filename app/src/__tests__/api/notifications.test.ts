import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/auth");

import { prismaMock } from "../helpers/prismaMock";
import { signedIn, signedOut } from "../helpers/authMock";
import { getRequest, routeCtx, makeNotification } from "../helpers";

// ─── /api/notifications ───────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/notifications/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("6-1: 未読通知一覧を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.notification.findMany.mockResolvedValue([
      makeNotification({ id: 1, type: "new_book", content: "新刊が出ました" }),
      makeNotification({ id: 2, type: "like", content: "いいねが付きました" }),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].isRead).toBe(false);
  });

  it("認証なし → 401を返す", async () => {
    signedOut();

    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ─── /api/notifications/[id]/read ────────────────────────────────────────────

describe("PATCH /api/notifications/[id]/read", () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    ({ PATCH } = await import("@/app/api/notifications/[id]/read/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  const call = (id: string) =>
    PATCH(getRequest(`/api/notifications/${id}/read`, undefined, { method: "PATCH" }), routeCtx({ id }));

  it("6-2: 通知を既読にする → 更新された通知を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.notification.findUnique.mockResolvedValue(makeNotification({ id: 1, userId: 1 }));
    prismaMock.notification.update.mockResolvedValue(makeNotification({ id: 1, isRead: true }));

    const res = await call("1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isRead).toBe(true);
  });

  it("不正なID → 400を返す", async () => {
    signedIn({ id: 1 });

    const res = await call("abc");
    expect(res.status).toBe(400);
  });

  it("未認証 → 401を返す", async () => {
    signedOut();

    const res = await call("1");
    expect(res.status).toBe(401);
  });

  it("他人の通知 → 403を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.notification.findUnique.mockResolvedValue(makeNotification({ id: 1, userId: 2 }));

    const res = await call("1");
    expect(res.status).toBe(403);
  });

  it("存在しない通知 → 404を返す", async () => {
    signedIn({ id: 1 });
    prismaMock.notification.findUnique.mockResolvedValue(null);

    const res = await call("1");
    expect(res.status).toBe(404);
  });
});

// ─── /api/notifications/read-all ──────────────────────────────────────────────

describe("PATCH /api/notifications/read-all", () => {
  let PATCH: () => Promise<Response>;

  beforeAll(async () => {
    ({ PATCH } = await import("@/app/api/notifications/read-all/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("6-3: 全通知を既読にする → success=trueを返す", async () => {
    signedIn({ id: 1 });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });

    const res = await PATCH();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("認証なし → 401を返す", async () => {
    signedOut();

    const res = await PATCH();
    expect(res.status).toBe(401);
  });
});
