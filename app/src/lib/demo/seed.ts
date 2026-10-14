/**
 * デモ環境（docs/demo-environment.md、#720）の、架空のユーザーと関係のデータの作成・初期化。
 * 接続先（デモ用 D1）の検証は、呼び出し側（prisma/scripts/demo/seed-demo.ts）が行う。
 *
 * 同時に複数回実行しない（D1 にはトランザクションも排他もない。定期的な初期化と手動の実行が重ならないようにする。#721）。
 *
 * 対象は、名前が `demo_` で始まり、メールが `@example.com` で終わるユーザーと、そのユーザーが持つデータだけ
 * （疎通確認用のユーザー、マスターデータ（賞・本・著者）には触れない）。
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma-d1";
import { buildDemoPlan, DEMO_EMAIL_SUFFIX, DEMO_USER_PASSWORD, isDemoUser, type DemoBook, type DemoPlan } from "./seedPlan";

export type DemoClient = PrismaClient;

const BCRYPT_COST = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 賞のある本を、ID の昇順に最大 `limit` 冊（ID は、マスターデータの投入結果から選ぶ。決め打ちしない）。 */
async function loadAwardBooks(prisma: DemoClient, limit: number): Promise<DemoBook[]> {
  const books = await prisma.book.findMany({
    where: { awardEntries: { some: {} } },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, title: true, isbn: true, authorId: true, author: { select: { name: true } } },
  });
  return books.map((book) => ({ id: book.id, title: book.title, isbn: book.isbn, authorId: book.authorId, authorName: book.author.name }));
}

/** デモのユーザーの ID。`@example.com` のユーザーを取り、名前の条件は JavaScript で判定する（LIKE の `_` が任意の 1 文字になるのを避けるため）。 */
async function findDemoUserIds(prisma: DemoClient): Promise<number[]> {
  const candidates = await prisma.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_SUFFIX } }, select: { id: true, name: true, email: true } });
  return candidates.filter(isDemoUser).map((user) => user.id);
}

/** デモのユーザーが持つデータ（関係・投稿・通知など）を消す。ユーザー自身は消さない。子 → 親の順。 */
async function deleteDemoOwnedData(prisma: DemoClient, userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  const reviewIds = (await prisma.review.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((review) => review.id);
  await prisma.like.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { reviewId: { in: reviewIds } }] } });
  await prisma.report.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { reviewId: { in: reviewIds } }] } });
  await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
  // デモのユーザー宛ての通知だけを消す（他のユーザー宛ての通知の actor は、ユーザーの削除で空になる）
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  // デモのユーザーが「フォローする」関係だけを消す（デモ以外のユーザーが、デモのユーザーをフォローする関係には触れない。
  // ユーザー自身を削除するとき（resetDemoData）は、外部キーの連鎖で消える）
  await prisma.follow.deleteMany({ where: { followerId: { in: userIds } } });
  await prisma.readingStatus.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.favoriteAuthor.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userLibrary.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.contactInquiry.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
}

export type DemoCounts = Record<string, number>;

/** デモのユーザーと、そのユーザーが持つデータの件数（初期化後に、すべて 0 になることの確認に使う）。 */
export async function countDemoData(prisma: DemoClient): Promise<DemoCounts> {
  const ids = await findDemoUserIds(prisma);
  const owned = { in: ids };
  return {
    users: ids.length,
    follows: await prisma.follow.count({ where: { OR: [{ followerId: owned }, { followingId: owned }] } }),
    readingStatuses: await prisma.readingStatus.count({ where: { userId: owned } }),
    reviews: await prisma.review.count({ where: { userId: owned } }),
    likes: await prisma.like.count({ where: { userId: owned } }),
    reports: await prisma.report.count({ where: { userId: owned } }),
    notifications: await prisma.notification.count({ where: { userId: owned } }),
    favoriteAuthors: await prisma.favoriteAuthor.count({ where: { userId: owned } }),
    libraries: await prisma.userLibrary.count({ where: { userId: owned } }),
  };
}

/** デモのユーザーと、そのユーザーが持つデータを、すべて消す。消したユーザーの数を返す。 */
export async function resetDemoData(prisma: DemoClient): Promise<number> {
  const ids = await findDemoUserIds(prisma);
  await deleteDemoOwnedData(prisma, ids);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

export type SeedOptions = {
  /** 管理者のパスワード。省略（空）なら、管理者は作らない。値は、コードにも出力にも書かない。 */
  adminPassword?: string;
  now?: Date;
  /** 真なら、管理者を作らない実行でも、既存の管理者（demo_admin）を消さない（定期的な初期化で使う）。 */
  keepAdmin?: boolean;
};

export type SeedSummary = { users: number; counts: DemoCounts };

const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * デモのデータを作る。何度実行しても同じ結果になる（ユーザーは、メールで upsert。
 * ユーザーが持つデータは、いったん消して作り直す）。
 */
export async function seedDemoData(prisma: DemoClient, options: SeedOptions = {}): Promise<SeedSummary> {
  const now = options.now ?? new Date();
  const adminPassword = options.adminPassword;
  if (adminPassword !== undefined && adminPassword !== "" && adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`管理者のパスワードは ${MIN_ADMIN_PASSWORD_LENGTH} 文字以上にしてください。`);
  }
  const includeAdmin = Boolean(adminPassword);

  const books = await loadAwardBooks(prisma, 24);
  const plan: DemoPlan = buildDemoPlan(books, { includeAdmin });
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  // 計画のメールが、デモ以外のユーザー（疎通確認用など）と衝突していないこと。衝突したまま upsert すると、そのユーザーを上書きし、
  // 以後の初期化で消してしまうため、書き込みの前に中断する
  const existing = await prisma.user.findMany({ where: { email: { in: plan.users.map((user) => user.email) } }, select: { name: true, email: true } });
  if (existing.some((user) => !isDemoUser(user))) {
    throw new Error("デモのユーザーと同じメールアドレスの、デモ以外のユーザーがいます。何も書かずに中断します。");
  }

  // 管理者を作らない実行では、以前に作った管理者も、このあとのユーザー作成の前に、消えるようにする
  await deleteDemoOwnedData(prisma, await findDemoUserIds(prisma));
  if (!includeAdmin && !options.keepAdmin) await prisma.user.deleteMany({ where: { email: "demo_admin@example.com", name: "demo_admin", role: "admin" } });

  const userPasswordHash = await bcrypt.hash(DEMO_USER_PASSWORD, BCRYPT_COST);
  const adminPasswordHash = includeAdmin ? await bcrypt.hash(adminPassword!, BCRYPT_COST) : undefined;
  const ids = new Map<string, number>();
  for (const user of plan.users) {
    const password = user.role === "admin" ? adminPasswordHash! : userPasswordHash;
    const data = { name: user.name, role: user.role, password, mustChangePassword: false, loginFailCount: 0, lockedUntil: null };
    const saved = await prisma.user.upsert({ where: { email: user.email }, update: data, create: { email: user.email, ...data } });
    ids.set(user.key, saved.id);
  }
  const idOf = (key: string) => {
    const id = ids.get(key);
    if (id === undefined) throw new Error("デモの計画に、存在しないユーザーが含まれています。");
    return id;
  };

  await prisma.follow.createMany({ data: plan.follows.map(([from, to], index) => ({ followerId: idOf(from), followingId: idOf(to), createdAt: daysAgo(30 - index) })) });
  await prisma.readingStatus.createMany({ data: plan.readingStatuses.map((row) => ({ userId: idOf(row.user), bookId: row.bookId, status: row.status })) });

  const reviewIds = new Map<string, number>();
  for (const review of plan.reviews) {
    const created = await prisma.review.create({
      data: { userId: idOf(review.user), bookId: review.bookId, body: review.body, isSpoiler: review.isSpoiler, isPublic: review.isPublic, createdAt: daysAgo(review.daysAgo) },
    });
    reviewIds.set(review.ref, created.id);
  }
  const reviewIdOf = (ref: string) => reviewIds.get(ref)!;
  await prisma.like.createMany({ data: plan.likes.map((like) => ({ userId: idOf(like.user), reviewId: reviewIdOf(like.reviewRef) })) });
  await prisma.report.createMany({ data: plan.reports.map((report) => ({ userId: idOf(report.user), reviewId: reviewIdOf(report.reviewRef), createdAt: daysAgo(2) })) });
  await prisma.favoriteAuthor.createMany({ data: plan.favoriteAuthors.map((row) => ({ userId: idOf(row.user), authorId: row.authorId })) });
  await prisma.userLibrary.createMany({ data: plan.libraries.map(({ user, ...library }) => ({ userId: idOf(user), ...library })) });
  await prisma.notification.createMany({
    data: plan.notifications.map(({ user, actor, daysAgo: days, ...notification }) => ({
      userId: idOf(user),
      actorId: actor ? idOf(actor) : null,
      createdAt: daysAgo(days),
      ...notification,
    })),
  });

  return { users: plan.users.length, counts: await countDemoData(prisma) };
}
