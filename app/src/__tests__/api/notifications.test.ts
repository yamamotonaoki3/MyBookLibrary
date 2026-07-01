import { NextRequest } from "next/server";

// ─── Prisma モック ────────────────────────────────────────────────────────────
const mockNotificationFindMany = jest.fn();
const mockNotificationFindUnique = jest.fn();
const mockNotificationUpdate = jest.fn();
const mockNotificationUpdateMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
      findUnique: (...args: unknown[]) => mockNotificationFindUnique(...args),
      update: (...args: unknown[]) => mockNotificationUpdate(...args),
      updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args),
    },
  },
}));

// ─── セッションモック ─────────────────────────────────────────────────────────
const mockAuth = jest.fn();
jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ─── /api/notifications ───────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/notifications/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("6-1: 未読通知一覧を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockNotificationFindMany.mockResolvedValue([
      { id: 1, userId: 1, type: "new_book", content: "新刊が出ました", isRead: false },
      { id: 2, userId: 1, type: "like", content: "いいねが付きました", isRead: false },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].isRead).toBe(false);
  });

  it("認証なし → 401を返す", async () => {
    mockAuth.mockResolvedValue(null);

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

  it("6-2: 通知を既読にする → 更新された通知を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockNotificationFindUnique.mockResolvedValue({ id: 1, userId: 1, isRead: false });
    mockNotificationUpdate.mockResolvedValue({ id: 1, isRead: true });

    const req = new NextRequest("http://localhost/api/notifications/1/read", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isRead).toBe(true);
  });

  it("不正なID → 400を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });

    const req = new NextRequest("http://localhost/api/notifications/abc/read", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("未認証 → 401を返す", async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications/1/read", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("他人の通知 → 403を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockNotificationFindUnique.mockResolvedValue({ id: 1, userId: 2, isRead: false });

    const req = new NextRequest("http://localhost/api/notifications/1/read", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(403);
  });

  it("存在しない通知 → 404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockNotificationFindUnique.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/notifications/1/read", { method: "PATCH" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "1" }) });
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
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockNotificationUpdateMany.mockResolvedValue({ count: 3 });

    const res = await PATCH();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("認証なし → 401を返す", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await PATCH();
    expect(res.status).toBe(401);
  });
});
