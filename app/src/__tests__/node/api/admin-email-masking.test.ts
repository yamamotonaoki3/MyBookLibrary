jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../../helpers/prismaMock";
import { asAdmin } from "../../helpers/sessionMock";
import { getRequest, jsonRequest, routeCtx } from "../../helpers";

// 管理者 API は、ほかのユーザーのメールを、既定ではマスクした値だけ返す。
const FULL = ["demo_mio@example.com", "demo_sakura@example.com", "demo_admin@example.com", "demo_unknown@example.com"];
const expectNoFullEmail = (json: unknown) => {
  const text = JSON.stringify(json);
  for (const email of FULL) expect(text).not.toContain(email);
  expect(text).not.toMatch(/demo_(mio|sakura|admin|unknown)/);
};

beforeEach(() => {
  jest.clearAllMocks();
  asAdmin(99);
});

describe("GET /api/admin/users", () => {
  it("メールをマスクして返す", async () => {
    const { GET } = await import("@/app/api/admin/users/route");
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, name: "mio", email: "demo_mio@example.com", role: "user", createdAt: new Date() },
    ] as never);
    const json = await (await GET()).json();
    expect(json[0].email).toBe("de***@e***.com");
    expectNoFullEmail(json);
  });
});

describe("GET /api/admin/inquiries", () => {
  it("送信者・ユーザーのメールをマスクして返す", async () => {
    const { GET } = await import("@/app/api/admin/inquiries/route");
    prismaMock.contactInquiry.findMany.mockResolvedValue([
      { id: 1, name: "mio", email: "demo_mio@example.com", user: { name: "mio", email: "demo_mio@example.com" } },
      { id: 2, name: "guest", email: "demo_sakura@example.com", user: null },
    ] as never);
    const json = await (await GET(getRequest("/api/admin/inquiries"))).json();
    expect(json[0].email).toBe("de***@e***.com");
    expect(json[0].user.email).toBe("de***@e***.com");
    expect(json[1].user).toBeNull();
    expectNoFullEmail(json);
  });
});

describe("PATCH /api/admin/inquiries/[id]", () => {
  it("更新後の応答に、メールを含めない", async () => {
    const { PATCH } = await import("@/app/api/admin/inquiries/[id]/route");
    prismaMock.contactInquiry.update.mockResolvedValue({
      id: 1,
      name: "mio",
      email: "demo_mio@example.com",
      status: "closed",
    } as never);
    const res = await PATCH(
      jsonRequest("/api/admin/inquiries/1", { method: "PATCH", body: { status: "closed" } }),
      routeCtx({ id: "1" })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ id: 1, status: "closed" });
    expectNoFullEmail(json);
  });
});

describe("GET /api/admin/manual-books", () => {
  it("登録者のメールをマスクして返す", async () => {
    const { GET } = await import("@/app/api/admin/manual-books/route");
    prismaMock.book.findMany.mockResolvedValue([
      { id: 1, title: "t", createdByUser: { id: 1, name: "mio", email: "demo_mio@example.com" } },
      { id: 2, title: "u", createdByUser: null },
    ] as never);
    const json = await (await GET()).json();
    expect(json[0].createdByUser.email).toBe("de***@e***.com");
    expect(json[1].createdByUser).toBeNull();
    expectNoFullEmail(json);
  });
});

describe("GET /api/admin/audit-logs", () => {
  it("実行者のメールをマスクして返す", async () => {
    const { GET } = await import("@/app/api/admin/audit-logs/route");
    prismaMock.auditLog.findMany.mockResolvedValue([
      { id: 1, eventType: "login_failure", actorEmail: "demo_unknown@example.com", actorUser: null },
      {
        id: 2,
        eventType: "admin_user_role_changed",
        actorEmail: "demo_admin@example.com",
        actorUser: { id: 9, name: "admin", email: "demo_admin@example.com" },
      },
    ] as never);
    prismaMock.auditLog.count.mockResolvedValue(2);
    const json = await (await GET(getRequest("/api/admin/audit-logs"))).json();
    expect(json.items[0].actorEmail).toBe("de***@e***.com");
    expect(json.items[1].actorUser.email).toBe("de***@e***.com");
    expectNoFullEmail(json);
  });
});

describe("GET /api/admin/audit-logs/[id]", () => {
  it("実行者のメールと、detail の中のメールをマスクして返す", async () => {
    const { GET } = await import("@/app/api/admin/audit-logs/[id]/route");
    prismaMock.auditLog.findUnique.mockResolvedValue({
      id: 2,
      eventType: "admin_user_role_changed",
      actorEmail: "demo_admin@example.com",
      actorUser: { id: 9, name: "admin", email: "demo_admin@example.com" },
      detail: { from: "user", to: "admin", targetEmail: "demo_mio@example.com" },
    } as never);
    const json = await (await GET(getRequest("/api/admin/audit-logs/2"), routeCtx({ id: "2" }))).json();
    expect(json.item.detail).toEqual({ from: "user", to: "admin", targetEmail: "de***@e***.com" });
    expectNoFullEmail(json);
  });
});
