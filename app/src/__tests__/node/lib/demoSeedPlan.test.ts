import { buildDemoPlan, DEMO_ADMIN_NAME, DEMO_USER_PASSWORD, isDemoUser, type DemoBook } from "@/lib/demo/seedPlan";

function books(count: number): DemoBook[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `テスト本 ${index + 1}`,
    isbn: index % 5 === 0 ? null : `97800000000${String(index).padStart(2, "0")}`,
    authorId: (index % 6) + 1,
    authorName: `テスト著者 ${(index % 6) + 1}`,
  }));
}

describe("isDemoUser（初期化の対象の判定）", () => {
  it("名前が demo_ で始まり、メールが @example.com で終わるものだけが対象", () => {
    expect(isDemoUser({ name: "demo_sakura", email: "demo_sakura@example.com" })).toBe(true);
    expect(isDemoUser({ name: "demo_sakura", email: "Demo_Sakura@Example.COM" })).toBe(true);
  });

  it("名前だけ、メールだけが一致するもの、似た名前（_ を任意の 1 文字として扱わない）は対象にしない", () => {
    expect(isDemoUser({ name: "demo_sakura", email: "demo_sakura@example.org" })).toBe(false);
    expect(isDemoUser({ name: "testuser_001", email: "testuser_001@example.com" })).toBe(false);
    expect(isDemoUser({ name: "demoXsakura", email: "demoXsakura@example.com" })).toBe(false);
    expect(isDemoUser({ name: "xdemo_sakura", email: "x@example.com" })).toBe(false);
  });
});

describe("buildDemoPlan", () => {
  it("本が 8 冊未満なら、マスターデータの投入を促して中断する", () => {
    expect(() => buildDemoPlan(books(7))).toThrow("マスターデータ");
  });

  it("同じ入力から、いつも同じ計画ができる（決定的）", () => {
    expect(buildDemoPlan(books(24))).toEqual(buildDemoPlan(books(24)));
  });

  it("ユーザーは 8 名で、名前は demo_、メールは @example.com。管理者は、指定したときだけ加わる", () => {
    const plan = buildDemoPlan(books(24));
    expect(plan.users).toHaveLength(8);
    expect(plan.users.every(isDemoUser)).toBe(true);
    expect(plan.users.every((user) => user.role === "user")).toBe(true);

    const withAdmin = buildDemoPlan(books(24), { includeAdmin: true });
    expect(withAdmin.users).toHaveLength(9);
    expect(withAdmin.users.filter((user) => user.role === "admin").map((user) => user.name)).toEqual([DEMO_ADMIN_NAME]);
    expect(withAdmin.users.every(isDemoUser)).toBe(true);
  });

  it("公開してよいパスワードは、デモ用の固定値で、管理者の値は計画に含まれない", () => {
    expect(DEMO_USER_PASSWORD).toBe("DemoPass123!");
    expect(JSON.stringify(buildDemoPlan(books(24), { includeAdmin: true }))).not.toContain("DemoPass");
  });

  it("相互フォローを含み、自分自身へのフォローや重複はない", () => {
    const { follows } = buildDemoPlan(books(24));
    expect(follows.every(([from, to]) => from !== to)).toBe(true);
    expect(new Set(follows.map((pair) => pair.join(">"))).size).toBe(follows.length);
    expect(follows.some(([a, b]) => follows.some(([c, d]) => c === b && d === a))).toBe(true);
  });

  it("読書状況は（ユーザー, 本）で重複せず、レビューを書いた本は「読了」になる", () => {
    const plan = buildDemoPlan(books(24));
    const pairs = plan.readingStatuses.map((row) => `${row.user}:${row.bookId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(new Set(plan.readingStatuses.map((row) => row.status))).toEqual(new Set(["read", "reading", "want_to_read"]));
    for (const review of plan.reviews) {
      expect(plan.readingStatuses.find((row) => row.user === review.user && row.bookId === review.bookId)?.status).toBe("read");
    }
  });

  it("レビューは、ネタバレあり・なし、公開・非公開を含む。いいねは自分以外が公開のレビューへ。通報は 2 名", () => {
    const plan = buildDemoPlan(books(24));
    expect(plan.reviews.some((r) => r.isSpoiler)).toBe(true);
    expect(plan.reviews.some((r) => !r.isSpoiler)).toBe(true);
    expect(plan.reviews.some((r) => !r.isPublic)).toBe(true);
    const byRef = new Map(plan.reviews.map((r) => [r.ref, r]));
    for (const like of plan.likes) {
      expect(byRef.get(like.reviewRef)!.user).not.toBe(like.user);
      expect(byRef.get(like.reviewRef)!.isPublic).toBe(true);
    }
    expect(new Set(plan.likes.map((l) => `${l.user}:${l.reviewRef}`)).size).toBe(plan.likes.length);
    expect(plan.reports).toHaveLength(2);
    expect(plan.reports.every((report) => byRef.get(report.reviewRef)!.user !== report.user)).toBe(true);
    expect(new Set(plan.reports.map((report) => report.user)).size).toBe(2);
  });

  it("通知は（宛先, 種類, ISBN）で重複しない（ISBN なしは除く）", () => {
    const { notifications } = buildDemoPlan(books(24));
    const keys = notifications.filter((n) => n.bookIsbn !== null).map((n) => `${n.user}:${n.type}:${n.bookIsbn}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(notifications.map((n) => n.type))).toEqual(new Set(["like", "mutual_favorite_author", "new_book"]));
  });

  it("お気に入り著者は各ユーザー 2 名で、重複しない。図書館は全員にある", () => {
    const plan = buildDemoPlan(books(24));
    expect(new Set(plan.favoriteAuthors.map((f) => `${f.user}:${f.authorId}`)).size).toBe(plan.favoriteAuthors.length);
    expect(plan.favoriteAuthors.filter((f) => f.user === "sakura")).toHaveLength(2);
    expect(new Set(plan.libraries.map((l) => l.user)).size).toBe(8);
    expect(new Set(plan.libraries.map((l) => `${l.user}:${l.systemid}:${l.libkey}`)).size).toBe(plan.libraries.length);
  });

  it("実在しうる個人情報を含まない（メールは予約ドメインだけ）", () => {
    const text = JSON.stringify(buildDemoPlan(books(24), { includeAdmin: true }));
    const emails = text.match(/[\w.-]+@[\w.-]+/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith("@example.com"))).toBe(true);
  });
});
