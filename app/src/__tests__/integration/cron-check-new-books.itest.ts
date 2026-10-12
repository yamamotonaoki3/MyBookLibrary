/**
 * 実DB統合テスト。Cron Trigger（scheduled ハンドラ）から新刊チェック API を呼び出し、
 * お気に入り著者の新刊の通知が作られることを検証する（MySQL・D1 の両方）。
 *
 * scheduled ハンドラ（src/lib/cronScheduler.ts）が、実際のルートハンドラ（Bearer 認証・DB 書き込みを含む）を
 * 呼び出す。楽天ブックス API だけはスタブにする（実際の API には接続しない）。
 */
jest.mock("@/lib/rakuten", () => ({ searchBooks: jest.fn() }));

import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { testPrisma, resetDb } from "../helpers/dbTest";
import { prisma } from "@/lib/prisma";
import { searchBooks, type RakutenBook } from "@/lib/rakuten";
import { createScheduledHandler, type CronEnv } from "@/lib/cronScheduler";

const searchBooksMock = jest.mocked(searchBooks);
// 秘密情報の検査（Gitleaks）の誤検知を避けるため、テスト用の値はリテラルで書かず実行時に生成する
const SECRET = `s${randomBytes(12).toString("hex")}`;

let GET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/cron/check-new-books/route"));
});

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  await resetDb();
});

/**
 * 今日（JST）から days 日ずれた日付を、楽天ブックスの発売日の書式（YYYY年MM月DD日）で返す。
 * D1 のローカル実行（miniflare）は偽のタイマーと併用できないため、現在時刻を固定せず、今日からの相対で作る。
 */
function salesDateFromToday(days: number): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}年${pad(jst.getUTCMonth() + 1)}月${pad(jst.getUTCDate())}日`;
}

/** 実際のルートハンドラを `fetch` として呼ぶ、Worker の fetch ハンドラの代わり。 */
const appFetch = async (request: Request) => GET(new NextRequest(request));

async function runScheduled(env: CronEnv): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const handler = createScheduledHandler(appFetch);
  await handler({ cron: "0 0 * * *" }, env, { waitUntil: (p) => void pending.push(p) });
  await Promise.all(pending);
}

const newBook = (index: number, salesDate: string): RakutenBook => ({
  title: `[E2E_TEST] 新刊${index}`,
  author: "テスト著者",
  largeImageUrl: "",
  publisherName: "テスト出版",
  salesDate,
  isbn: `97800000001${String(index).padStart(2, "0")}`,
  size: "単行本",
});

async function seedFavorite(notify = true) {
  const user = await testPrisma.user.create({ data: { name: "通知先", email: "cron@example.com", role: "user" } });
  const author = await testPrisma.author.create({ data: { name: "テスト著者" } });
  await testPrisma.favoriteAuthor.create({ data: { userId: user.id, authorId: author.id, notify } });
  return user;
}

describe("Cron Trigger → /api/cron/check-new-books", () => {
  it("お気に入り著者の新刊の通知を作成する", async () => {
    const user = await seedFavorite();
    searchBooksMock.mockResolvedValue([newBook(1, salesDateFromToday(-1)), newBook(2, salesDateFromToday(3))]);

    await runScheduled({ CRON_SECRET: SECRET });

    const notes = await testPrisma.notification.findMany({ where: { userId: user.id }, orderBy: { bookIsbn: "asc" } });
    expect(notes.map((n) => [n.type, n.bookIsbn])).toEqual([
      ["new_book", "9780000000101"],
      ["new_book", "9780000000102"],
    ]);
    expect(notes[0].content).toContain("が発売されました");
    expect(notes[1].content).toContain("が発売予定です");
  });

  it("同じ新刊を再実行しても、重複した通知は作らない（再実行しても安全）", async () => {
    const user = await seedFavorite();
    searchBooksMock.mockResolvedValue([newBook(1, salesDateFromToday(-1))]);

    await runScheduled({ CRON_SECRET: SECRET });
    await runScheduled({ CRON_SECRET: SECRET });

    expect(await testPrisma.notification.count({ where: { userId: user.id } })).toBe(1);
  });

  it("通知を OFF にしている著者は対象にしない", async () => {
    await seedFavorite(false);
    searchBooksMock.mockResolvedValue([newBook(1, salesDateFromToday(-1))]);

    await runScheduled({ CRON_SECRET: SECRET });

    expect(searchBooksMock).not.toHaveBeenCalled();
    expect(await testPrisma.notification.count()).toBe(0);
  });

  it("1 週間より前の本は通知しない", async () => {
    await seedFavorite();
    searchBooksMock.mockResolvedValue([newBook(1, salesDateFromToday(-30))]);

    await runScheduled({ CRON_SECRET: SECRET });

    expect(await testPrisma.notification.count()).toBe(0);
  });

  it("新刊が多数あっても（D1 のバインドパラメータの上限を超える件数でも）すべて通知を作る", async () => {
    const user = await seedFavorite();
    searchBooksMock.mockResolvedValue(Array.from({ length: 35 }, (_, i) => newBook(i, salesDateFromToday(-1))));

    await runScheduled({ CRON_SECRET: SECRET });

    expect(await testPrisma.notification.count({ where: { userId: user.id } })).toBe(35);
  });

  it("CRON_SECRET が一致しなければ、通知を作らず失敗する", async () => {
    await seedFavorite();
    searchBooksMock.mockResolvedValue([newBook(1, salesDateFromToday(-1))]);
    process.env.CRON_SECRET = `d${randomBytes(12).toString("hex")}`;

    await expect(runScheduled({ CRON_SECRET: SECRET })).rejects.toThrow("cron failed: 401");

    expect(await testPrisma.notification.count()).toBe(0);
  });
});
