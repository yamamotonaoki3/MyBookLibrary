import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asAdmin, asForbidden, asUnauthenticated } from "../../helpers/sessionMock";
import { jsonRequest } from "../../helpers";
import { AUDIT_EVENT } from "@/lib/auditEvents";
import { EMAIL_REVEAL_LIMIT_PER_MINUTE } from "@/lib/emailReveal";

const ADMIN_ID = 99;

describe("POST /api/admin/email-reveal", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/admin/email-reveal/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.auditLog.count.mockResolvedValue(0);
    prismaMock.auditLog.create.mockResolvedValue({ id: 500 } as never);
    prismaMock.auditLog.update.mockResolvedValue({} as never);
  });

  const call = (body: unknown) => POST(jsonRequest("/api/admin/email-reveal", { body }));

  it("未認証 → 401、メールは取得しない", async () => {
    asUnauthenticated();
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("管理者でない → 403、メールは取得せず、監査ログにも書かない", async () => {
    asForbidden();
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "other", id: 1 }],
    [{ kind: "user", id: "1" }],
    [{ kind: "user", id: 0 }],
    [{ kind: "user" }],
    [null],
  ])("不正な入力 %j → 400", async (body) => {
    asAdmin(ADMIN_ID);
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("ユーザーのメールを返し、監査ログに記録する（メールの値は記録しない）", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ email: "demo_mio@example.com" } as never);

    const res = await call({ kind: "user", id: 7 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "demo_mio@example.com" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      eventType: AUDIT_EVENT.ADMIN_EMAIL_REVEALED,
      actorUserId: ADMIN_ID,
      targetType: "User",
      targetId: 7,
    });
    expect(JSON.stringify(data)).not.toContain("demo_mio");
  });

  it("問い合わせの送信者のメールを返す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.contactInquiry.findUnique.mockResolvedValue({ email: "demo_sakura@example.com" } as never);
    const res = await call({ kind: "inquiry", id: 3 });
    expect(await res.json()).toEqual({ email: "demo_sakura@example.com" });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ targetType: "ContactInquiry", targetId: 3 });
  });

  it("監査ログの実行者のメールを返す（actorEmail を優先）", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.auditLog.findUnique.mockResolvedValue({
      actorEmail: "demo_unknown@example.com",
      actorUser: { email: "demo_admin@example.com" },
    } as never);
    const res = await call({ kind: "audit-log", id: 5 });
    expect(await res.json()).toEqual({ email: "demo_unknown@example.com" });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ targetType: "AuditLog", targetId: 5 });
  });

  it("表示させた要求の記録は、更新しない（表示した記録のまま）", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ email: "demo_mio@example.com" } as never);
    await call({ kind: "user", id: 7 });
    expect(prismaMock.auditLog.update).not.toHaveBeenCalled();
  });

  it("対象がない → 404、記録に「表示させなかった」理由を残す", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await call({ kind: "user", id: 404 });
    expect(res.status).toBe(404);
    expect(prismaMock.auditLog.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { detail: { granted: false, reason: "not_found" } },
    });
  });

  it("上限ちょうど（自分の記録を含めて上限と同数）までは通る", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.auditLog.count.mockResolvedValue(EMAIL_REVEAL_LIMIT_PER_MINUTE);
    prismaMock.user.findUnique.mockResolvedValue({ email: "demo_mio@example.com" } as never);
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(200);
  });

  it("上限を超えている → 429、メールは取得せず、先に記録してから数える", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.auditLog.count.mockResolvedValue(EMAIL_REVEAL_LIMIT_PER_MINUTE + 1);
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.count.mock.calls[0][0]).toMatchObject({
      where: { eventType: AUDIT_EVENT.ADMIN_EMAIL_REVEALED, actorUserId: ADMIN_ID },
    });
    // 並列の要求が、どれも「上限未満」と判定されないよう、数える前に記録している
    expect(prismaMock.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.auditLog.count.mock.invocationCallOrder[0]
    );
    expect(prismaMock.auditLog.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { detail: { granted: false, reason: "rate_limited" } },
    });
  });

  it("表示させなかった記録の更新に失敗しても、429 を返す（メールは返さない）", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.auditLog.count.mockResolvedValue(EMAIL_REVEAL_LIMIT_PER_MINUTE + 1);
    prismaMock.auditLog.update.mockRejectedValue(new Error("db down"));
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(429);
  });

  it("監査ログに記録できなかった → 500 で、メールは返さない", async () => {
    asAdmin(ADMIN_ID);
    prismaMock.user.findUnique.mockResolvedValue({ email: "demo_mio@example.com" } as never);
    prismaMock.auditLog.create.mockRejectedValue(new Error("db down"));
    const res = await call({ kind: "user", id: 1 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("demo_mio");
  });
});
