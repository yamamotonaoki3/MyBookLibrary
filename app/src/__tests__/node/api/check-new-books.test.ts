import { NextRequest } from "next/server";

jest.mock("@/lib/prisma");
jest.mock("@/lib/rakuten", () => ({ searchBooks: jest.fn() }));

import { prismaMock } from "../../helpers/prismaMock";
import { searchBooks } from "@/lib/rakuten";
import type { RakutenBook } from "@/lib/rakuten";

const searchBooksMock = jest.mocked(searchBooks);

describe("GET /api/cron/check-new-books release message", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ GET } = await import("@/app/api/cron/check-new-books/route"));
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-05T03:00:00Z"));
    process.env.CRON_SECRET = "test-cron-secret-1234";
    prismaMock.favoriteAuthor.findMany.mockResolvedValue([
      { userId: 1, author: { name: "テスト著者" }, user: {} },
    ]);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.createMany.mockResolvedValue({ count: 5 });
  });

  afterEach(() => jest.useRealTimers());

  it("日不明の今月以降を発売予定、日が判明している日付を日単位で判定する", async () => {
    const salesDates = [
      "2026年09月",
      "2026年10月",
      "2026年09月04日",
      "2026年09月05日",
      "2026年09月06日",
    ];
    searchBooksMock.mockResolvedValue(
      salesDates.map(
        (salesDate, index): RakutenBook => ({
          title: `本${index}`,
          author: "テスト著者",
          largeImageUrl: "",
          publisherName: "出版社",
          salesDate,
          isbn: `isbn-${index}`,
          size: "単行本",
        }),
      ),
    );

    const req = new NextRequest("http://localhost/api/cron/check-new-books", {
      headers: { authorization: "Bearer test-cron-secret-1234" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const createArgs = prismaMock.notification.createMany.mock.calls[0][0];
    expect(createArgs.data).toEqual([
      expect.objectContaining({ content: expect.stringContaining("「本0」が発売予定です") }),
      expect.objectContaining({ content: expect.stringContaining("「本1」が発売予定です") }),
      expect.objectContaining({ content: expect.stringContaining("「本2」が発売されました") }),
      expect.objectContaining({ content: expect.stringContaining("「本3」が発売されました") }),
      expect.objectContaining({ content: expect.stringContaining("「本4」が発売予定です") }),
    ]);
  });
});
