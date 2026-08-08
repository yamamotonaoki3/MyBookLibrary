jest.mock("@/lib/prisma");
jest.mock("@/lib/session");

import { prismaMock } from "../helpers/prismaMock";
import { asAdmin, asForbidden } from "../helpers/sessionMock";
import { getRequest } from "../helpers";

describe("GET /api/admin/inquiries", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/inquiries/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("管理者でない → 403を返す", async () => {
    asForbidden();
    const res = await GET(getRequest("/api/admin/inquiries"));
    expect(res.status).toBe(403);
  });

  it("status指定なし → 全件を取得する", async () => {
    asAdmin(1);
    prismaMock.contactInquiry.findMany.mockResolvedValue([]);

    const res = await GET(getRequest("/api/admin/inquiries"));
    expect(res.status).toBe(200);
    expect(prismaMock.contactInquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("status=unresolved を指定 → 絞り込み条件付きで取得する", async () => {
    asAdmin(1);
    prismaMock.contactInquiry.findMany.mockResolvedValue([]);

    await GET(getRequest("/api/admin/inquiries", { status: "unresolved" }));
    expect(prismaMock.contactInquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "unresolved" } })
    );
  });

  it("DBエラー → 500を返す", async () => {
    asAdmin(1);
    prismaMock.contactInquiry.findMany.mockRejectedValue(new Error("db error"));

    const res = await GET(getRequest("/api/admin/inquiries"));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/admin/stats", () => {
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/stats/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("管理者でない → 403を返す", async () => {
    asForbidden();
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("正常系: 集計値をまとめて返す", async () => {
    asAdmin(1);
    prismaMock.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    prismaMock.review.count.mockResolvedValue(5);
    prismaMock.like.count.mockResolvedValue(20);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      userCount: 10,
      reviewCount: 5,
      likeCount: 20,
      newUsersThisMonth: 2,
    });
  });

  it("集計中に例外発生 → 500を返す", async () => {
    asAdmin(1);
    prismaMock.user.count.mockRejectedValue(new Error("db error"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
