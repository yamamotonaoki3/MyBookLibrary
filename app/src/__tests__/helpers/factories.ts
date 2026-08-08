/**
 * テストデータのファクトリ。
 *
 * Prisma が返すレコードを模した素朴なオブジェクトを組み立てる。
 * 値は**固定値**にしており、乱数（faker 等）は使わない。テストが実行ごとに
 * 揺れると失敗の再現ができなくなるため。
 *
 * 使い方:
 *
 * ```ts
 * prismaMock.review.findUnique.mockResolvedValue(makeReview({ userId: 2 }));
 * ```
 */

/** 日付を固定してスナップショット的な比較が安定するようにする。 */
export const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

type Overrides<T> = Partial<T> & Record<string, unknown>;

function build<T extends object>(base: T, overrides: Overrides<T> = {}): T & Record<string, unknown> {
  return { ...base, ...overrides };
}

export function makeUser(overrides: Overrides<Record<string, unknown>> = {}) {
  return build(
    {
      id: 1,
      name: "テストユーザー",
      email: "user@example.com",
      image: null,
      password: "hashed_password",
      role: "user",
      loginFailCount: 0,
      lockedUntil: null,
      secretWordHash: null,
      secretWordFailCount: 0,
      secretWordLockedUntil: null,
      createdAt: FIXED_DATE,
    },
    overrides
  );
}

export function makeAdminUser(overrides: Overrides<Record<string, unknown>> = {}) {
  return makeUser({ id: 99, name: "管理者", email: "admin@example.com", role: "admin", ...overrides });
}

export function makeAuthor(overrides: Overrides<Record<string, unknown>> = {}) {
  return build({ id: 10, name: "夏目漱石" }, overrides);
}

export function makeBook(overrides: Overrides<Record<string, unknown>> = {}) {
  return build(
    {
      id: 20,
      authorId: 10,
      title: "吾輩は猫である",
      isbn: "9784000000000",
      publishedAt: FIXED_DATE,
      coverImageUrl: null,
      source: "rakuten",
      createdByUserId: null,
    },
    overrides
  );
}

export function makeReview(overrides: Overrides<Record<string, unknown>> = {}) {
  return build(
    {
      id: 30,
      userId: 1,
      bookId: 20,
      body: "とても面白い本でした。読んで良かったです。",
      isSpoiler: false,
      isPublic: true,
      createdAt: FIXED_DATE,
    },
    overrides
  );
}

export function makeNotification(overrides: Overrides<Record<string, unknown>> = {}) {
  return build(
    {
      id: 40,
      userId: 1,
      type: "like",
      content: "いいねが付きました",
      isRead: false,
      createdAt: FIXED_DATE,
    },
    overrides
  );
}

export function makeFavoriteAuthor(overrides: Overrides<Record<string, unknown>> = {}) {
  return build({ id: 50, userId: 1, authorId: 10, notify: true }, overrides);
}

export function makeReadingStatus(overrides: Overrides<Record<string, unknown>> = {}) {
  return build({ id: 60, userId: 1, bookId: 20, status: "reading", updatedAt: FIXED_DATE }, overrides);
}

export function makeAward(overrides: Overrides<Record<string, unknown>> = {}) {
  return build({ id: 70, name: "芥川龍之介賞" }, overrides);
}

export function makeAwardEntry(overrides: Overrides<Record<string, unknown>> = {}) {
  return build({ id: 80, bookId: 20, awardId: 70, year: 2025, type: "winner" }, overrides);
}
