/**
 * 実DB統合テスト。`api/reading-status` の upsert を検証する。
 *
 * `@@unique([userId, bookId])` を使った `upsert` が、実DBに対して
 * 「新規作成」と「既存更新」の両方を正しく1レコードに保つことを確認する。
 * また status="unread" のときは論理削除ではなく物理削除される仕様も確認する。
 */
jest.mock("@/lib/session");
// 応答後の処理は即時実行せず、登録された処理を取り出して検証する
jest.mock("@/lib/afterResponse");

import { testPrisma, resetDb } from "../helpers/dbTest";
import { asUser } from "../helpers/sessionMock";
import { jsonRequest } from "../helpers";
import { runAfterResponse } from "@/lib/afterResponse";
import { restoreFetch } from "../helpers/fetchMock";

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/reading-status/route"));
});

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterEach(() => {
  restoreFetch();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("POST /api/reading-status", () => {
  const body = {
    title: "吾輩は猫である",
    author: "夏目漱石",
    status: "reading",
  };

  it("同じ本への2回目の登録は新規行を作らず既存行を更新する", async () => {
    const user = await testPrisma.user.create({
      data: { name: "読書ユーザー", email: "reading-user@example.com", role: "user" },
    });

    asUser(user.id);
    const first = await POST(jsonRequest("/api/reading-status", { body }));
    expect(first.status).toBe(200);

    const second = await POST(
      jsonRequest("/api/reading-status", { body: { ...body, status: "read" } })
    );
    expect(second.status).toBe(200);

    const rows = await testPrisma.readingStatus.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("read");
  });

  it("status=unread にすると行が物理削除される", async () => {
    const user = await testPrisma.user.create({
      data: { name: "読書ユーザー2", email: "reading-user2@example.com", role: "user" },
    });

    asUser(user.id);
    await POST(jsonRequest("/api/reading-status", { body }));
    expect(await testPrisma.readingStatus.findMany({ where: { userId: user.id } })).toHaveLength(1);

    const res = await POST(
      jsonRequest("/api/reading-status", { body: { ...body, status: "unread" } })
    );
    expect(res.status).toBe(200);
    expect(await testPrisma.readingStatus.findMany({ where: { userId: user.id } })).toHaveLength(0);
  });

  it("新規登録した本の他版ISBNは、応答後の処理として保存される（応答時点では未保存）", async () => {
    const ndlHardcoverXml = `<?xml version="1.0"?><searchRetrieveResponse><numberOfRecords>1</numberOfRecords><records><record><recordData>
<dc:title>しき</dc:title><dc:creator>町屋良平</dc:creator>
<dc:identifier>ISBN 9784309027180</dc:identifier><dcterms:extent>172p ; 20cm</dcterms:extent>
</recordData></record></records></searchRetrieveResponse>`;
    const rakutenPaperback = {
      Items: [
        {
          title: "しき",
          author: "町屋良平",
          largeImageUrl: "",
          publisherName: "テスト出版",
          salesDate: "2020年03月",
          isbn: "9784309417738",
          size: "文庫",
        },
      ],
      pageCount: 1,
    };
    // NDL・楽天ともスタブ応答（実リクエストは送らない）。URLで振り分ける
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("ndlsearch")) return new Response(ndlHardcoverXml, { status: 200 });
      return new Response(JSON.stringify(rakutenPaperback), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    process.env.RAKUTEN_APP_ID = "test-app-id";
    process.env.RAKUTEN_ACCESS_KEY = "test-access-key";

    const user = await testPrisma.user.create({
      data: { name: "読書ユーザー3", email: "reading-user3@example.com", role: "user" },
    });
    asUser(user.id);

    const res = await POST(
      jsonRequest("/api/reading-status", {
        body: { title: "しき", author: "町屋良平", status: "reading", isbn: "9784309417738" },
      })
    );
    expect(res.status).toBe(200);

    // 応答時点では、単行本ISBNで本が登録され、他版ISBNの収集は未実行
    const book = await testPrisma.book.findFirstOrThrow({ where: { title: "しき" } });
    expect(book.isbn).toBe("9784309027180");
    expect(await testPrisma.bookIsbn.count({ where: { bookId: book.id } })).toBe(0);
    expect(runAfterResponse).toHaveBeenCalledTimes(1);

    // 応答後の処理を実行すると、単行本（主ISBN）と文庫の両方が保存される
    const deferred = (runAfterResponse as jest.Mock).mock.calls[0][0] as () => Promise<void>;
    await deferred();
    const isbns = await testPrisma.bookIsbn.findMany({ where: { bookId: book.id }, orderBy: { isbn: "asc" } });
    expect(isbns.map((r) => r.isbn)).toEqual(["9784309027180", "9784309417738"]);
    expect(isbns.find((r) => r.isbn === "9784309027180")?.isPrimary).toBe(true);

    delete process.env.RAKUTEN_APP_ID;
    delete process.env.RAKUTEN_ACCESS_KEY;
  }, 20000);
});
