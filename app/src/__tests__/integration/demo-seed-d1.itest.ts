/**
 * 結合テスト（D1）。デモ用のデータの作成・初期化（#720）を、ローカルの D1（miniflare）に対して検証する。
 * 実データ・デモや本番の D1 には接続しない。
 */
import bcrypt from "bcryptjs";
import { testPrisma, resetDb, isD1 } from "../helpers/dbTest";
import { countDemoData, resetDemoData, seedDemoData, type DemoClient } from "@/lib/demo/seed";
import { DEMO_USER_PASSWORD } from "@/lib/demo/seedPlan";
import { prisma } from "@/lib/prisma";

const describeD1 = isD1 ? describe : describe.skip;
const demo = testPrisma as unknown as DemoClient;

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

/** マスターデータ（賞のある本 10 冊）と、デモ以外のユーザー。 */
async function seedMasters(): Promise<void> {
  await testPrisma.award.create({ data: { name: "[E2E_TEST] 架空の賞" } });
  for (let i = 1; i <= 10; i += 1) {
    const author = await testPrisma.author.create({ data: { name: `[E2E_TEST] 著者 ${i}` } });
    const book = await testPrisma.book.create({
      data: { authorId: author.id, title: `[E2E_TEST] 本 ${i}`, isbn: i === 1 ? null : `97800000010${String(i).padStart(2, "0")}`, publishedAt: new Date("2026-01-01") },
    });
    await testPrisma.awardEntry.create({ data: { bookId: book.id, awardId: 1, year: 2026, type: "winner" } });
  }
  // 本だけがあって賞のない本は、デモの対象にならない
  const other = await testPrisma.author.create({ data: { name: "[E2E_TEST] 賞なしの著者" } });
  await testPrisma.book.create({ data: { authorId: other.id, title: "[E2E_TEST] 賞なしの本", publishedAt: new Date("2026-01-01") } });
}

async function seedOtherUsers(): Promise<{ smokeId: number; lookalikeId: number }> {
  // 疎通確認用のユーザー（デモの対象外）と、名前が似ているだけのユーザー（demoXlookalike。_ を任意の 1 文字として扱わないことの確認）
  const smoke = await testPrisma.user.create({ data: { name: "testuser_smoke", email: "testuser_smoke@example.com" } });
  const lookalike = await testPrisma.user.create({ data: { name: "demoXlookalike", email: "demoXlookalike@example.com" } });
  const book = await testPrisma.book.findFirstOrThrow({ orderBy: { id: "asc" } });
  await testPrisma.review.create({ data: { userId: smoke.id, bookId: book.id, body: "[E2E_TEST] 疎通確認の感想" } });
  await testPrisma.readingStatus.create({ data: { userId: lookalike.id, bookId: book.id, status: "read" } });
  return { smokeId: smoke.id, lookalikeId: lookalike.id };
}

describeD1("デモ用のデータの作成・初期化（ローカルの D1・架空データ）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedMasters();
  });

  it("ユーザーと、各関係が作られる（管理者は、パスワードを渡したときだけ）", async () => {
    const summary = await seedDemoData(demo, { adminPassword: "test-admin-password-1" });

    expect(summary.users).toBe(9);
    expect(summary.counts).toMatchObject({ users: 9 });
    for (const name of ["follows", "readingStatuses", "reviews", "likes", "reports", "notifications", "favoriteAuthors", "libraries"]) {
      expect(summary.counts[name]).toBeGreaterThan(0);
    }
    const admin = await testPrisma.user.findUnique({ where: { email: "demo_admin@example.com" } });
    expect(admin?.role).toBe("admin");
    expect(await bcrypt.compare("test-admin-password-1", admin!.password!)).toBe(true);
    const sakura = await testPrisma.user.findUnique({ where: { email: "demo_sakura@example.com" } });
    expect(sakura).toMatchObject({ name: "demo_sakura", role: "user", mustChangePassword: false });
    expect(await bcrypt.compare(DEMO_USER_PASSWORD, sakura!.password!)).toBe(true);
    // 賞のない本は、読書状況に使われない
    const noAward = await testPrisma.book.findFirstOrThrow({ where: { awardEntries: { none: {} } } });
    expect(await testPrisma.readingStatus.count({ where: { bookId: noAward.id } })).toBe(0);
  });

  it("管理者のパスワードがなければ、管理者は作らない。短いパスワードは拒否する", async () => {
    const summary = await seedDemoData(demo);
    expect(summary.users).toBe(8);
    expect(await testPrisma.user.count({ where: { role: "admin" } })).toBe(0);

    await expect(seedDemoData(demo, { adminPassword: "short" })).rejects.toThrow("12 文字以上");
  });

  it("管理者を作った後に、パスワードなしで再実行すると、管理者は消える", async () => {
    await seedDemoData(demo, { adminPassword: "test-admin-password-1" });
    await seedDemoData(demo);
    expect(await testPrisma.user.count({ where: { role: "admin" } })).toBe(0);
  });

  it("2 回実行しても、重複しない（件数もユーザーの ID も同じ）", async () => {
    const first = await seedDemoData(demo, { adminPassword: "test-admin-password-1" });
    const idsBefore = (await testPrisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }));

    const second = await seedDemoData(demo, { adminPassword: "test-admin-password-1" });

    expect(second.counts).toEqual(first.counts);
    expect(await testPrisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } })).toEqual(idsBefore);
  });

  it("初期化で、デモのデータだけが消え、残数が 0 になる（疎通確認用のユーザー、似た名前のユーザー、マスターデータは残る）", async () => {
    const { smokeId, lookalikeId } = await seedOtherUsers();
    await seedDemoData(demo, { adminPassword: "test-admin-password-1" });
    const booksBefore = await testPrisma.book.count();
    const authorsBefore = await testPrisma.author.count();

    const removed = await resetDemoData(demo);

    expect(removed).toBe(9);
    expect(Object.values(await countDemoData(demo)).every((count) => count === 0)).toBe(true);
    expect(await testPrisma.user.count({ where: { email: { endsWith: "@example.com" }, name: { startsWith: "demo" } } })).toBe(1); // demoXlookalike だけ
    expect(await testPrisma.user.findUnique({ where: { id: smokeId } })).not.toBeNull();
    expect(await testPrisma.review.count({ where: { userId: smokeId } })).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { id: lookalikeId } })).not.toBeNull();
    expect(await testPrisma.readingStatus.count({ where: { userId: lookalikeId } })).toBe(1);
    expect(await testPrisma.book.count()).toBe(booksBefore);
    expect(await testPrisma.author.count()).toBe(authorsBefore);
    expect(await testPrisma.awardEntry.count()).toBe(10);
  });

  it("デモのユーザーと同じメールの、デモ以外のユーザーがいれば、何も書かずに中断する（上書き・削除をしない）", async () => {
    const other = await testPrisma.user.create({ data: { name: "testuser_clash", email: "demo_sakura@example.com", role: "user" } });

    await expect(seedDemoData(demo)).rejects.toThrow("デモ以外のユーザー");

    expect(await testPrisma.user.count()).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { id: other.id } })).toMatchObject({ name: "testuser_clash", password: null });
    expect(await resetDemoData(demo)).toBe(0);
    expect(await testPrisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
  });

  it("初期化しても、デモ以外のユーザー宛ての通知は消えない（actor が空になるだけ）", async () => {
    await seedDemoData(demo);
    const sakura = await testPrisma.user.findUniqueOrThrow({ where: { email: "demo_sakura@example.com" } });
    const outsider = await testPrisma.user.create({ data: { name: "testuser_outsider", email: "testuser_outsider@example.com" } });
    await testPrisma.notification.create({ data: { userId: outsider.id, type: "mutual_favorite_author", content: "[E2E_TEST] 通知", actorId: sakura.id } });

    await resetDemoData(demo);

    expect(await testPrisma.notification.findFirst({ where: { userId: outsider.id } })).toMatchObject({ actorId: null });
  });

  it("初期化の後に、もう一度作成できる", async () => {
    const first = await seedDemoData(demo);
    await resetDemoData(demo);
    const again = await seedDemoData(demo);
    expect(again.counts).toEqual(first.counts);
  });

  it("マスターデータがなければ、何も作らずに中断する", async () => {
    await resetDb();
    await expect(seedDemoData(demo)).rejects.toThrow("マスターデータ");
    expect(await testPrisma.user.count()).toBe(0);
  });
});
