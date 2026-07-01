const mockRequireAdminSession = jest.fn();
const mockInquiryFindMany = jest.fn();
const mockUserCount = jest.fn();
const mockReviewCount = jest.fn();
const mockLikeCount = jest.fn();

jest.mock("@/lib/session", () => ({
  requireAdminSession: () => mockRequireAdminSession(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    contactInquiry: { findMany: (...args: unknown[]) => mockInquiryFindMany(...args) },
    user: { count: (...args: unknown[]) => mockUserCount(...args) },
    review: { count: (...args: unknown[]) => mockReviewCount(...args) },
    like: { count: (...args: unknown[]) => mockLikeCount(...args) },
  },
}));

const adminOk = { userId: 1, error: null };
const notAdmin = {
  userId: null,
  error: new Response(JSON.stringify({ error: "権限がありません" }), { status: 403 }),
};

describe("GET /api/admin/inquiries", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/admin/inquiries/route"));
  });

  beforeEach(() => jest.clearAllMocks());

  it("管理者でない → 403を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(notAdmin);
    const res = await GET(new Request("http://localhost/api/admin/inquiries"));
    expect(res.status).toBe(403);
  });

  it("status指定なし → 全件を取得する", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockInquiryFindMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/admin/inquiries"));
    expect(res.status).toBe(200);
    expect(mockInquiryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("status=unresolved を指定 → 絞り込み条件付きで取得する", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockInquiryFindMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/admin/inquiries?status=unresolved"));
    expect(mockInquiryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "unresolved" } })
    );
  });

  it("DBエラー → 500を返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockInquiryFindMany.mockRejectedValue(new Error("db error"));

    const res = await GET(new Request("http://localhost/api/admin/inquiries"));
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
    mockRequireAdminSession.mockResolvedValue(notAdmin);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("正常系: 集計値をまとめて返す", async () => {
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockUserCount.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    mockReviewCount.mockResolvedValue(5);
    mockLikeCount.mockResolvedValue(20);

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
    mockRequireAdminSession.mockResolvedValue(adminOk);
    mockUserCount.mockRejectedValue(new Error("db error"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
